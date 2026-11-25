import assert from 'node:assert/strict';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';

const server = await startFakeAiServer();
server.game.ai = null;
let browser, release;
try {
  browser = await launchBrowser(process.env.SHIFT_TEST_CHROMIUM ? {executablePath: process.env.SHIFT_TEST_CHROMIUM} : {});
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let attempt = 0;
  const firstResponse = new Promise(resolve => { release = resolve; });
  await page.route('**/api/session', async route => {
    if (++attempt !== 1) return route.continue();
    await firstResponse;
    return route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"synthetic interruption"}'});
  });
  await page.goto(server.origin, {waitUntil: 'domcontentloaded'});
  await page.fill('#create-name', 'Ada');
  assert.equal(await page.locator('#create-form button').isEnabled(), false, 'cannot create before connection');
  release();
  await page.getByRole('alert').filter({hasText: 'Could not connect to the Bureau.'}).waitFor();
  await page.getByRole('button', {name: 'Retry connection'}).click();
  await page.waitForFunction(() => !document.querySelector('#create-form button')?.disabled);
  assert.equal(await page.locator('#create-name').inputValue(), 'Ada', 'retry preserves entered codename');
  assert.equal(attempt, 2);
  assert.deepEqual(errors, []);
  const noScript = await browser.newPage({javaScriptEnabled: false});
  noScript.setDefaultTimeout(4000);
  await noScript.goto(server.origin);
  await noScript.getByText('SHIFT needs JavaScript to play. Enable it, then reload this page.', {exact: true}).waitFor();
  assert.equal(await noScript.getByText('Connecting to the Bureau…', {exact: true}).isVisible(), false);
  console.log('Startup recovery passed: a synthetic 503 offers retry, preserves input, and the no-JS shell explains the requirement.');
} finally {
  release?.();
  await browser?.close();
  await server.close();
}
