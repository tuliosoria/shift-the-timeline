// Local synthetic dialogue only. Searches never leave the browser or consume a question.
import assert from 'node:assert/strict';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';
const server = await startFakeAiServer({delay: 350});
let browser;
const errors = [], external = [], requests = [];
async function ask(page, text, count) {
  await page.fill('#question', text); await page.press('#question', 'Enter');
  await page.waitForFunction(n => document.querySelectorAll('#transcript .b.me').length === n && !document.querySelector('#transcript .typing'), count);
}
try {
  browser = await launchBrowser();
  const pages = [];
  for (let n = 0; n < 3; n++) {
    const context = await browser.newContext({viewport: {width: 320, height: 740}, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push({page, url: r.url(), method: r.method(), body: r.postData()}));
    await page.goto(server.origin); pages.push(page);
  }
  const [host, reader, other] = pages;
  await host.fill('#create-name', 'Ada'); await host.click('#create-form button');
  const code = (await host.locator('.room-code').textContent()).trim();
  for (const [n, page] of pages.slice(1).entries()) {
    await page.goto(`${server.origin}/#join=${code}`); await page.fill('#join-name', ['Bo', 'Cy'][n]); await page.click('#join-form button'); await page.locator('.lobby').waitFor();
  }
  await host.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled); await host.click('[data-action=start]');
  for (const [n, page] of pages.entries()) {
    await page.click('[data-action=begin]'); await page.click(`[data-suspect=suspect-${n}]`); await page.click('[data-action=question]'); await page.locator('#question').waitFor();
  }
  await ask(host, 'Where is Ada’s private evidence?', 1);
  await ask(reader, 'Where is the blue vase?', 1);
  await reader.fill('#question', 'My unsent next question'); await reader.locator('#question').blur();
  await reader.click('#tabbar [data-tab=deductions]'); await reader.click('[data-notebook=search]');
  const start = requests.length;
  await reader.fill('#evidence-query', 'blue vase');
  const result = reader.locator('[id^="search-answer-"]').first(), id = await result.getAttribute('id'), message = await result.getAttribute('data-message');
  assert.equal(await reader.locator('.evidence-results li').count(), 1);
  await reader.locator('#evidence-query').evaluate(el => {el.setSelectionRange(2, 4);});
  await reader.evaluate(() => { window.searchFieldBeforePoll = document.querySelector('#evidence-query'); });
  await ask(other, 'Where is Cy’s private evidence?', 1); // changed room snapshot forces a real re-render
  await reader.waitForTimeout(2800);
  assert.ok(await reader.evaluate(() => window.searchFieldBeforePoll === document.querySelector('#evidence-query')), 'polling preserves the actual input node');
  assert.equal(await reader.evaluate(() => document.activeElement.id), 'evidence-query');
  assert.deepEqual(await reader.locator('#evidence-query').evaluate(el => [el.selectionStart, el.selectionEnd]), [2, 4]);
  await result.focus(); await reader.keyboard.press('Enter');
  assert.equal(await reader.evaluate(() => document.activeElement.id), `review-message-${message}`);
  assert.match(await reader.locator('.source-answer').textContent(), /blue vase/);
  await reader.click('[data-action=notebook-back]');
  assert.equal(await reader.evaluate(() => document.activeElement.id), id);
  assert.equal(await reader.inputValue('#evidence-query'), 'blue vase');
  await reader.reload(); await reader.locator('#evidence-query').waitFor();
  assert.equal(await reader.inputValue('#evidence-query'), 'blue vase');
  assert.equal(await reader.locator('.evidence-results li').count(), 1);
  await reader.fill('#evidence-query', 'Ada’s private evidence');
  assert.equal(await reader.locator('.evidence-results li').count(), 0, 'other players’ testimony is never searched');
  await reader.fill('#evidence-query', '"><img src=x onerror=alert(1)>');
  assert.equal(await reader.locator('.evidence-results li').count(), 0);
  await reader.click('[data-action=clear-search]');
  assert.equal(await reader.inputValue('#evidence-query'), '');
  assert.equal(await reader.evaluate(() => document.activeElement.id), 'evidence-query');
  await reader.fill('#evidence-query', 'synthetic');
  await reader.locator('[id^="search-deduction-"]').first().click();
  assert.match(await reader.locator('.source-note').textContent(), /Source for your deduction/);
  assert.equal(await reader.evaluate(() => document.activeElement.id), `review-message-${message}`);
  await reader.click('[data-action=notebook-back]');
  assert.match(await reader.evaluate(() => document.activeElement.id), /^search-deduction-/);
  await reader.fill('#evidence-query', 'x'.repeat(100));
  await reader.fill('#evidence-query', 'blue');
  await reader.screenshot({path: `${process.env.SHIFT_SCREENSHOTS ?? '/tmp'}/shift-evidence-search-full-320.png`});
  await reader.fill('#evidence-query', 'x'.repeat(100));
  await reader.setViewportSize({width: 320, height: 380});
  assert.ok(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await reader.fill('#evidence-query', 'blue');
  await reader.screenshot({path: `${process.env.SHIFT_SCREENSHOTS ?? '/tmp'}/shift-evidence-search-320.png`});
  const searchRequests = requests.slice(start).filter(r => r.page === reader);
  assert.ok(!searchRequests.some(r => r.url.includes('blue') || r.body?.includes('blue') || r.body?.includes('synthetic') || r.body?.includes('onerror')), 'search text never reaches the network');
  assert.ok(!searchRequests.some(r => r.url.endsWith('/actions') && r.body && JSON.parse(r.body).type !== 'heartbeat'), 'search and source review do not mutate gameplay');
  await reader.click('#tabbar [data-tab=investigate]');
  assert.equal(await reader.inputValue('#question'), 'My unsent next question');
  // Search remains available when a host moves the clock, and links stay on the old turn.
  await host.click('#tabbar [data-tab=deductions]');
  for (const question of ['Who is Ada here with?', 'Why is Ada here?']) {
    await host.click('#tabbar [data-tab=investigate]'); await ask(host, question, question.startsWith('Who') ? 2 : 3);
  }
  await host.click('[data-action=leave-chat]');
  await reader.locator('#question').blur(); await reader.click('#tabbar [data-tab=deductions]');
  await host.click('[data-action=advance]'); await host.click('#confirm-accept');
  await reader.waitForFunction(() => document.querySelector('#header .clock')?.textContent.startsWith('Turn 2'));
  assert.equal(await reader.inputValue('#evidence-query'), 'blue');
  await reader.locator('[id^="search-answer-"]').first().click();
  assert.match(await reader.locator('.review .eyebrow').textContent(), /Turn 1/);
  assert.match(await reader.locator('.saved-draft').textContent(), /My unsent next question/);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('Evidence search passed: 3 phones, private exact-source links, keyboard/caret, polling, reload, hostile query, clearing, no search requests or mutations, draft retention, clock advance and 320px layout.');
} finally { await browser?.close(); await server.close(); }
