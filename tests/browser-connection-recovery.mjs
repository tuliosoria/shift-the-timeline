// A healthy unchanged room is still a successful reconnect. Synthetic canonical case only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';
const server = await startFakeAiServer();
server.game.ai = null; // No provider jobs: this test exercises network recovery, not dialogue.
const browser = await launchBrowser();
try {
  const page = await browser.newPage({viewport: {width: 390, height: 640}, reducedMotion: 'reduce'});
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && /\/api\/rooms/.test(request.url())) writes.push(request.postDataJSON()); });
  page.setDefaultTimeout(10000);
  await page.goto(server.origin);
  await page.fill('#create-name', 'Ada'); await page.click('#create-form button');
  const code = (await page.locator('.room-code').textContent()).trim();
  const host = (await server.store.getRoom(code)).players[0].token;
  const act = (session, action) => server.game.act(code, session, {id: randomUUID(), ...action});
  for (const name of ['Bo', 'Cy']) await server.game.join(code, name, name, randomUUID());
  await act(host, {type: 'start'});
  await page.click('[data-action=begin]');
  await page.click('[data-suspect=suspect-1]'); await page.click('[data-action=question]');
  await page.fill('#question', 'Unsent thought kept for review');
  // Enough private evidence to leave a meaningful reading position in the notebook.
  for (let round = 1; round <= 4; round++) {
    if (round > 1) await act(host, {type: 'select', round, suspectId: 'suspect-1'});
    for (let q = 1; q <= 3; q++) await act(host, {type: 'ask', round, question: `Synthetic question ${q} from turn ${round}?`});
    await act(host, {type: 'advance', round, confirmed: true});
  }
  for (const session of [host, 'Bo', 'Cy']) await act(session, {type: 'vote', suspectId: 'suspect-0'});
  await page.locator('.screen.reveal').waitFor();
  await page.click('[data-tab=deductions]'); await page.click('[data-notebook=search]');
  await page.fill('#evidence-query', 'Synthetic');
  await page.locator('#evidence-query').evaluate(field => {
    field.setSelectionRange(2, 7, 'backward'); window.savedField = field;
    document.querySelector('#main').scrollTop = 140;
    window.savedScroll = document.querySelector('#main').scrollTop;
  });
  const version = (await server.store.getRoom(code)).version, beforeWrites = writes.length;
  const savedUi = await page.evaluate(() => localStorage.getItem('shift-ui-v2'));
  assert.ok(JSON.parse(savedUi).drafts.some(draft => draft.value === 'Unsent thought kept for review'));
  const forcePoll = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  let fail = true;
  const polling = /\/state\?since=/;
  await page.route(polling, route => fail ? route.abort('failed') : route.continue());
  await forcePoll();
  await page.locator('#notice.error', {hasText: 'Connection interrupted. Reconnecting…'}).waitFor();
  fail = false;
  const healthy = page.waitForResponse(response => response.url().includes('/state?since=') && response.status() === 204);
  await forcePoll(); await healthy;
  await page.waitForFunction(() => !document.querySelector('#notice').classList.contains('show'));
  assert.equal((await server.store.getRoom(code)).version, version, 'recovery does not require a gameplay mutation');
  assert.equal(writes.length, beforeWrites, 'recovery sends no heartbeat or command in a completed room');
  assert.equal(await page.evaluate(() => localStorage.getItem('shift-ui-v2')), savedUi, 'reconnect leaves archived drafts and notebook persistence untouched');
  assert.deepEqual(await page.locator('#evidence-query').evaluate(field => [field === window.savedField, field.value, field.selectionStart, field.selectionEnd, field.selectionDirection, document.activeElement === field,
    document.querySelector('#main').scrollTop === window.savedScroll]), [true, 'Synthetic', 2, 7, 'backward', true, true], '204 recovery does not rebuild or move the notebook');

  // A successful poll is not permission to dismiss a different notice.
  await page.click('[data-tab=case]');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async () => { throw Error('Synthetic denial'); }}}));
  await page.click('[data-action=copy-invite]');
  assert.equal(await page.locator('#notice').textContent(), `Invite link: ${server.origin}/#join=${code}`);
  const unchanged = page.waitForResponse(response => response.url().includes('/state?since=') && response.status() === 204);
  await forcePoll(); await unchanged;
  assert.equal(await page.locator('#notice').textContent(), `Invite link: ${server.origin}/#join=${code}`, 'copy fallback remains available');

  // The old room's reconnect notice belongs to that room, not the landing screen.
  fail = true; await forcePoll();
  await page.locator('#notice.error', {hasText: 'Connection interrupted. Reconnecting…'}).waitFor();
  // An old healthy response arriving after navigation must not dismiss a held new entry.
  await page.unroute(polling);
  let release, arrived;
  const held = new Promise(resolve => { arrived = resolve; });
  await page.route(polling, async route => {
    const response = await route.fetch();
    arrived(); await new Promise(resolve => { release = resolve; });
    await route.fulfill({response});
  });
  await forcePoll(); await held;
  await page.click('[data-action=switch-room]'); await page.click('#confirm-accept');
  assert.equal(await page.locator('#notice.show').count(), 0, 'leaving the room clears only its connection notice');
  await page.click('[data-entry=create]'); await page.fill('#create-name', 'Ada again');
  let lose = true;
  await page.route('**/api/rooms', async route => {
    if (!lose) return route.continue();
    lose = false; await route.fetch(); return route.abort('failed');
  });
  await page.click('#create-form button');
  await page.locator('#notice [data-action=retry]').waitFor();
  const pending = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shift-pending')));
  const oldResponse = page.waitForResponse(response => response.url().includes(`/rooms/${code}/state?since=`));
  release(); await oldResponse; await page.waitForTimeout(100);
  assert.equal(await page.locator('#notice [data-action=retry]').count(), 1, 'old success cannot clear the current safe retry');
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('shift-pending')).body.requestId), pending.body.requestId);
  assert.equal(await page.evaluate(() => localStorage.getItem('shift-session')), null, 'old snapshot cannot restore the departed room');
  await page.unroute(polling);
  await page.click('#notice [data-action=retry]');
  await page.locator('.room-code').waitFor();
  assert.notEqual((await page.locator('.room-code').textContent()).trim(), code);
  assert.equal(server.store.rooms.size, 2, 'entry retry still creates only one new room');

  // Even identical wording from a rejected command is not a poll-owned notice.
  const nextCode = (await page.locator('.room-code').textContent()).trim();
  for (const name of ['Dee', 'Eli']) await server.game.join(nextCode, name, name, randomUUID());
  await forcePoll();
  await page.waitForFunction(() => document.querySelectorAll('.roster li').length === 3);
  await page.route('**/actions', route => route.request().postDataJSON()?.type === 'start'
    ? route.fulfill({status: 409, contentType: 'application/json', body: JSON.stringify({error: 'Connection interrupted. Reconnecting…'})}) : route.continue());
  await page.click('[data-action=start]');
  await page.locator('#notice.error', {hasText: 'Connection interrupted. Reconnecting…'}).waitFor();
  const successfulPoll = page.waitForResponse(response => response.url().includes(`/rooms/${nextCode}/state?since=`) && [200, 204].includes(response.status()));
  await forcePoll(); await successfulPoll; await page.waitForTimeout(100);
  assert.equal(await page.locator('#notice.error').textContent(), 'Connection interrupted. Reconnecting…', 'healthy polling cannot dismiss command errors by matching their text');
  assert.deepEqual(errors, []);
  console.log('Connection recovery passed: unchanged reveal204 clears only its connection notice, preserves notebook/caret/scroll, writes nothing, and stale success cannot erase a new safe retry.');
} finally { await browser.close(); await server.close(); }
