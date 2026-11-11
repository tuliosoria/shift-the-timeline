// Private evidence through real HTTP and three isolated phones. Synthetic delayed AI only.
import assert from 'node:assert/strict';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';

const server = await startFakeAiServer({delay: 2200});
let browser, releasePending = () => {};
const errors = [], external = [], writes = [];
const shot = process.env.SHIFT_SCREENSHOTS ?? '/tmp';
const snapshot = (page, code) => page.evaluate(async code => (await fetch(`/api/rooms/${code}/state`)).json(), code);
async function ask(page, question, count) {
  await page.fill('#question', question);
  await page.press('#question', 'Enter');
  await page.waitForFunction(n => document.querySelectorAll('#transcript .b.me').length === n && !document.querySelector('#transcript .typing'), count);
}
async function pick(page, id) {
  await page.locator('.pick').waitFor();
  await page.click(`[data-suspect="${id}"]`);
  await page.click('[data-action=question]');
  await page.locator('#question').waitFor();
}
try {
  browser = await launchBrowser();
  const contexts = [], pages = [];
  for (const width of [390, 320, 390]) {
    const context = await browser.newContext({viewport: {width, height: 740}, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/actions')) writes.push({page, body: r.postDataJSON()}); });
    await page.goto(server.origin);
    contexts.push(context); pages.push(page);
  }
  const [host, reader, other] = pages;
  await host.fill('#create-name', 'Ada'); await host.click('#create-form button');
  const code = (await host.locator('.room-code').textContent()).trim();
  for (const [index, page] of pages.slice(1).entries()) {
    await page.goto(`${server.origin}/#join=${code}`);
    await page.fill('#join-name', ['Bo', 'Cy'][index]); await page.click('#join-form button');
    await page.locator('.lobby').waitFor();
  }
  await host.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled);
  await host.click('[data-action=start]');
  for (const [index, page] of pages.entries()) {
    await page.click('[data-action=begin]');
    await pick(page, `suspect-${index}`);
  }

  // A committed question whose acknowledgement is lost remains safely retryable while
  // looking in the notebook; the original request id and a newer draft survive reload.
  let lost = false;
  const drop = async route => {
    if (route.request().postDataJSON()?.type !== 'ask' || lost) return route.continue();
    lost = true; await route.fetch(); await route.abort('failed');
  };
  await reader.route('**/actions', drop);
  await reader.fill('#question', 'Where is my private notebook clue?');
  await reader.press('#question', 'Enter');
  await reader.locator('#notice.error button[data-action=retry]').waitFor();
  await reader.fill('#question', 'A newer private thought');
  await reader.locator('#question').blur();
  await reader.click('#tabbar [data-tab=deductions]');
  await reader.click('[data-notebook=interviews]');
  await reader.click('[data-interview="1:suspect-1"]');
  assert.equal(await reader.locator('#question').count(), 0);
  await reader.reload();
  await reader.locator('.review .b.them', {hasText: 'A synthetic reply to: Where is my private notebook clue?'}).waitFor();
  assert.equal((await snapshot(reader, code)).me.interviews[0].messages.length, 1);
  const attempts = writes.filter(w => w.page === reader && w.body.type === 'ask');
  assert.equal(attempts.length, 2, 'one retry of the uncertain delivery');
  assert.deepEqual(attempts[0].body, attempts[1].body, 'retry has exactly the original body and id');
  await reader.unroute('**/actions', drop);
  await reader.click('#tabbar [data-tab=investigate]');
  assert.equal(await reader.inputValue('#question'), 'A newer private thought');

  await ask(host, 'Where is Ada alone?', 1);
  await ask(host, 'Who is Ada asking?', 2);
  await ask(host, 'Why is Ada here?', 3);
  await host.click('[data-action=leave-chat]');
  await ask(other, 'Where is Cy alone?', 1);

  // Evidence links point to the exact private source. Keyboard focus, long drafts and
  // reading position survive polls; opening and closing the archive sends nothing.
  await reader.click('#tabbar [data-tab=deductions]');
  await reader.click('[data-action=notebook-back]');
  await reader.click('[data-notebook=deductions]');
  const sourceId = await reader.locator('[data-deduction]').first().getAttribute('data-message');
  const before = writes.length;
  await reader.locator('[data-deduction]').first().focus();
  await reader.keyboard.press('Enter');
  assert.equal(await reader.evaluate(() => document.activeElement.id), `review-message-${sourceId}`);
  assert.match(await reader.locator('.source-answer').textContent(), /Where is my private notebook clue/);
  assert.match(await reader.locator('.saved-draft').textContent(), /A newer private thought/);
  await reader.waitForTimeout(2800);
  assert.equal(await reader.evaluate(() => document.activeElement.id), `review-message-${sourceId}`);
  assert.equal(writes.length, before, 'review has no game mutations');
  await reader.reload();
  await reader.locator('.source-answer').waitFor();
  assert.match(await reader.locator('.source-answer').textContent(), /Where is my private notebook clue/);
  await reader.click('[data-action=notebook-back]');
  assert.match(await reader.evaluate(() => document.activeElement.id), /^source-/);
  await reader.click('#tabbar [data-tab=investigate]');
  assert.equal(await reader.inputValue('#question'), 'A newer private thought');

  // Keep reading when the host advances during a delayed second answer. The old draft
  // stays labelled in its original interview; the next turn starts with an empty composer.
  let release, intercepted, fulfilled;
  const routeFailures = [];
  const held = new Promise(r => { release = releasePending = r; }), reached = new Promise(r => { intercepted = r; }), delivered = new Promise(r => { fulfilled = r; });
  const holdResponse = async route => {
    if (route.request().postDataJSON()?.type !== 'ask') return route.continue();
    const response = await route.fetch(); intercepted(); await held;
    await route.fulfill({response}).catch(e => routeFailures.push(e.message)); fulfilled();
  };
  await reader.route('**/actions', holdResponse);
  await reader.fill('#question', 'Where is the second private clue?'); await reader.press('#question', 'Enter');
  await reached;
  await reader.locator('#transcript .typing').waitFor();
  const draft = 'Unsent after the interruption ' + 'x'.repeat(250);
  await reader.fill('#question', draft); await reader.locator('#question').blur();
  await reader.click('#tabbar [data-tab=deductions]'); await reader.click('[data-notebook=interviews]');
  await reader.click('[data-interview="1:suspect-1"]');
  await reader.click('[data-action=notebook-back]');
  await reader.locator('.interview-list').waitFor();
  assert.equal(await reader.evaluate(() => document.activeElement.id), 'interview-1:suspect-1', 'Back works while the write acknowledgement is pending');
  await reader.click('[data-interview="1:suspect-1"]');
  release(); await delivered; await reader.unroute('**/actions', holdResponse);
  assert.deepEqual(routeFailures, []);
  await host.click('[data-action=advance]'); await host.click('#confirm-accept');
  await reader.waitForFunction(() => document.querySelector('#header .clock')?.textContent.startsWith('Turn 2'));
  await reader.locator('.review .b.them', {hasText: 'A synthetic reply to: Where is the second private clue?'}).waitFor();
  assert.match(await reader.locator('#announcer').textContent(), /Reply added to your private interview/);
  assert.equal(await reader.locator('#question').count(), 0);
  assert.match(await reader.locator('.saved-draft').textContent(), /Unsent after the interruption/);
  await reader.setViewportSize({width: 320, height: 380});
  assert.ok(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'long draft fits a narrow low-height phone');
  await reader.screenshot({path: `${shot}/shift-notebook-source-320.png`});
  await reader.reload(); await reader.locator('.review').waitFor();
  assert.match(await reader.locator('.saved-draft').textContent(), /Unsent after the interruption/);
  await reader.click('#tabbar [data-tab=investigate]');
  if (await reader.locator('[data-action=leave-chat]').count()) await reader.click('[data-action=leave-chat]');
  await reader.locator('.transition').waitFor(); await reader.click('[data-action=continue]');
  await pick(reader, 'suspect-1');
  assert.equal(await reader.inputValue('#question'), '');
  await ask(reader, 'Where is a later visit?', 1);
  await reader.locator('#question').blur(); await reader.click('#tabbar [data-tab=deductions]');
  await reader.click('[data-action=notebook-back]'); await reader.click('[data-notebook=deductions]'); await reader.locator('[data-deduction]').first().click();
  assert.match(await reader.locator('.review .eyebrow').textContent(), /Turn 1/);
  assert.equal(await reader.locator('.source-answer').getAttribute('id'), `review-message-${sourceId}`);
  assert.doesNotMatch(await reader.locator('.review').textContent(), /later visit|Ada alone|Cy alone/);
  for (const page of [host, other]) {
    const state = await snapshot(page, code);
    assert.ok(!JSON.stringify(state).includes('private notebook clue'), 'other players never receive private testimony');
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('Notebook browser passed: 3 phones, exact private sources, interrupted delivery/retry, reload, draft recovery, late answer, host advance, revisit and 320px low-height layout.');
} finally {
  releasePending();
  await browser?.close(); await server.close();
}
