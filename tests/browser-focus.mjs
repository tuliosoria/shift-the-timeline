// Keyboard focus must survive other agents changing the room, without spending questions.
import assert from 'node:assert/strict';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';

const server = await startFakeAiServer();
let browser;
const errors = [], external = [];
try {
  browser = await launchBrowser();
  const pages = [];
  for (const width of [320, 390, 390]) {
    const context = await browser.newContext({viewport: {width, height: 640}, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.origin);
    pages.push(page);
  }
  const [host, reader, other] = pages;
  await host.fill('#create-name', 'Ada'); await host.click('#create-form button');
  const code = (await host.locator('.room-code').textContent()).trim();
  await host.locator('[data-action=copy-code]').focus();
  await reader.goto(`${server.origin}/#join=${code}`);
  await reader.fill('#join-name', 'Bo'); await reader.click('#join-form button');
  await host.waitForFunction(() => document.querySelectorAll('.roster li').length === 2);
  assert.equal(await host.evaluate(() => document.activeElement.dataset.action), 'copy-code', 'lobby update must not drop keyboard focus');

  // Native dialog focus restoration needs a live equivalent of its replaced opener.
  await host.locator('[data-action=switch-room]').focus();
  await host.keyboard.press('Enter');
  await other.goto(`${server.origin}/#join=${code}`);
  await other.fill('#join-name', 'Cy'); await other.click('#join-form button');
  await host.waitForFunction(() => document.querySelectorAll('.roster li').length === 3);
  assert.equal(await host.evaluate(() => document.activeElement.id), 'confirm-cancel', 'room updates must not steal modal focus');
  await host.keyboard.press('Escape');
  assert.equal(await host.evaluate(() => document.activeElement.dataset.action), 'switch-room', 'cancel returns to the current switch-room button');

  await host.click('[data-action=start]');
  for (const page of pages) await page.click('[data-action=begin]');
  await reader.locator('#tabbar [data-tab=case]').focus();
  await host.click('[data-suspect=suspect-0]'); await host.click('[data-action=question]');
  await reader.waitForFunction(() => document.querySelector('[data-suspect=suspect-0] .badge')?.textContent.includes('Ada'));
  assert.equal(await reader.evaluate(() => document.activeElement.dataset.tab), 'case', 'another agent choosing a suspect must not reset bottom navigation');
  await reader.keyboard.press('Enter');
  await reader.locator('.casefile').waitFor();
  assert.equal(await reader.evaluate(() => document.activeElement.id), 'main');
  await reader.locator('[data-action=switch-room]').focus();
  await host.fill('#question', 'Where were you?'); await host.press('#question', 'Enter');
  await host.waitForFunction(() => document.querySelectorAll('#transcript .b.them').length > 1);
  // Force a fresh, same-room snapshot rather than depending on a heartbeat timer.
  await reader.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await reader.waitForTimeout(2600);
  assert.equal(await reader.evaluate(() => document.activeElement.dataset.action), 'switch-room');
  assert.ok(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await reader.screenshot({path: `${process.env.SHIFT_SCREENSHOTS ?? '/tmp'}/shift-keyboard-focus-390.png`});
  await host.locator('#question').blur();
  await host.setViewportSize({width: 320, height: 380});
  await host.click('#tabbar [data-tab=case]');
  await host.locator('[data-action=switch-room]').focus(); await host.keyboard.press('Enter');
  await host.screenshot({path: `${process.env.SHIFT_SCREENSHOTS ?? '/tmp'}/shift-keyboard-dialog-320.png`});
  await host.keyboard.press('Escape');
  assert.equal(await host.evaluate(() => document.activeElement.dataset.action), 'switch-room');
  // A round change dismisses an obsolete confirmation without stranding focus.
  await reader.locator('[data-action=switch-room]').focus(); await reader.keyboard.press('Enter');
  const advance = () => host.evaluate(async code => {
    const response = await fetch(`/api/rooms/${code}/actions`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({type: 'advance', id: crypto.randomUUID(), confirmed: true, round: Number(document.querySelector('#header .clock').textContent.match(/Turn (\d+)/)[1])})});
    if (!response.ok) throw Error(`Synthetic advance failed: ${response.status}`);
  }, code);
  await advance();
  await reader.waitForFunction(() => document.querySelector('#header .clock')?.textContent.startsWith('Turn 2'));
  assert.equal(await reader.locator('#confirm-dialog').evaluate(dialog => dialog.open), false);
  assert.equal(await reader.evaluate(() => document.activeElement.id), 'main', 'a transition replacing the modal opener has a safe focus destination');
  await reader.click('[data-action=continue]');
  await reader.click('[data-suspect=suspect-1]'); await reader.click('[data-action=question]');
  await reader.fill('#question', 'A private unsent question');
  await reader.locator('#question').evaluate(field => field.setSelectionRange(2, 9, 'backward'));
  // Another player's interview change updates this room without rebuilding the draft.
  await other.locator('.transition').waitFor(); await other.click('[data-action=continue]');
  await other.click('[data-suspect=suspect-2]'); await other.click('[data-action=question]');
  const update = reader.waitForResponse(response => response.url().includes('/state?since=') && response.status() === 200);
  await reader.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await update;
  await reader.waitForTimeout(100);
  assert.deepEqual(await reader.locator('#question').evaluate(field => [field.value, field.selectionStart, field.selectionEnd, field.selectionDirection, document.activeElement === field]),
    ['A private unsent question', 2, 9, 'backward', true]);
  await reader.locator('#question').blur(); await reader.click('#tabbar [data-tab=deductions]');
  assert.equal(await reader.evaluate(() => document.activeElement.id), 'main', 'explicit navigation still owns focus');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('Keyboard focus: live lobby, bottom navigation, modal polling and short-phone cancel passed.');
} finally { await browser?.close(); await server.close(); }
