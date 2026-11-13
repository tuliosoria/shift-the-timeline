// Corrupted successful responses are ambiguous delivery, never acknowledgements.
// Synthetic server/provider only. A retry must reuse the original command or seat request.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';

const server = await startFakeAiServer({delay: 50});
const browser = await launchBrowser();
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  const page = await context.newPage(), errors = [], creations = [], asks = [];
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', {...original, set(value) {
      if (window.failNextRender && ['main', 'transcript'].includes(this.id)) {
        window.failNextRender = false;
        throw new Error('Synthetic one-shot render failure');
      }
      return original.set.call(this, value);
    }});
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    if (new URL(request.url()).pathname === '/api/rooms') creations.push(request.postDataJSON());
    if (request.url().endsWith('/actions') && request.postDataJSON()?.type === 'ask') asks.push(request.postDataJSON());
  });
  page.setDefaultTimeout(10000);
  const entryCorruptions = ['wrong-seat', 'null-player', 'render-fault'];
  await page.route('**/api/rooms', async route => {
    const response = await route.fetch();
    const corruption = entryCorruptions.shift();
    if (!corruption) return route.fulfill({response});
    const data = await response.json();
    if (corruption === 'null-player') data.state.players = [null];
    if (corruption === 'render-fault') await page.evaluate(() => { window.failNextRender = true; });
    // Syntactically valid, but the claimed seat does not belong to its snapshot.
    await route.fulfill({response, json: corruption === 'wrong-seat' ? {...data, playerId: 'wrong-seat'} : data});
  });
  await page.goto(server.origin);
  await page.fill('#create-name', 'Ada');
  await page.click('#create-form button');
  await page.locator('#notice [data-action=retry]').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('shift-session')), null, 'an invalid seat is not saved');
  const pendingEntry = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shift-pending')));
  assert.equal(pendingEntry.body.requestId, creations[0].requestId);
  for (let i = 0; i < 2; i++) {
    await page.click('#notice [data-action=retry]');
    await page.waitForFunction(() => !document.body.classList.contains('busy'));
    assert.equal(await page.evaluate(() => localStorage.getItem('shift-session')), null, 'unrendered entry never persists a seat');
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('shift-pending')).body.requestId), creations[0].requestId);
  }
  await page.reload();
  await page.locator('.room-code').waitFor();
  const code = (await page.locator('.room-code').textContent()).trim();
  assert.equal(creations.length, 4);
  assert.ok(creations.every(entry => entry.requestId === creations[0].requestId));
  assert.equal(server.store.rooms.size, 1, 'entry retry creates no second room');
  assert.equal((await server.store.getRoom(code)).players.length, 1, 'entry retry creates no second seat');
  for (const [index, name] of ['Bo', 'Cy'].entries()) await server.game.join(code, `synthetic-${index}`, name, randomUUID());
  await page.click('[data-action=start]');
  await page.click('[data-action=begin]');
  await page.click('[data-suspect=suspect-1]');
  await page.click('[data-action=question]');

  const corruptions = ['truncated', 'null', 'wrong-room', 'no-content', 'null-message', 'null-deduction', 'null-suspect', 'null-player', 'missing-reveal', 'render-fault'];
  const expectedAttempts = corruptions.length + 1;
  await page.route('**/actions', async route => {
    if (route.request().postDataJSON()?.type !== 'ask') return route.continue();
    const response = await route.fetch(), corruption = corruptions.shift();
    if (corruption === 'truncated') return route.fulfill({status: 200, contentType: 'application/json', body: '{"code":'});
    if (corruption === 'null') return route.fulfill({status: 200, contentType: 'application/json', body: 'null'});
    if (corruption === 'wrong-room') return route.fulfill({response, json: {...await response.json(), code: code === 'ABCDEFGH' ? 'JKLMNPQR' : 'ABCDEFGH'}});
    if (corruption === 'no-content') return route.fulfill({status: 204});
    if (corruption) {
      const data = await response.json();
      if (corruption === 'null-message') data.me.interviews.at(-1).messages = [null];
      if (corruption === 'null-deduction') data.me.deductions = [null];
      if (corruption === 'null-suspect') data.suspects = [null];
      if (corruption === 'null-player') data.players = [null];
      if (corruption === 'missing-reveal') { data.phase = 'reveal'; delete data.result; }
      if (corruption === 'render-fault') await page.evaluate(() => { window.failNextRender = true; });
      return route.fulfill({response, json: data});
    }
    return route.fulfill({response});
  });
  await page.fill('#question', 'Where were you at eight?');
  await page.press('#question', 'Enter');
  await page.locator('#notice [data-action=retry]').waitFor();
  const requestId = asks[0].id;
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('shift-pending')).action.id), requestId);
  // A later thought must survive the acknowledgement of the previous question.
  await page.fill('#question', 'My newer unsent thought');
  await page.click('#notice [data-action=retry]'); // null response, still in the open chat
  await page.waitForFunction(() => !document.body.classList.contains('busy'));
  assert.equal(await page.inputValue('#question'), 'My newer unsent thought');
  await page.reload(); // wrong-room response on the held command's automatic retry
  await page.locator('#notice [data-action=retry]').waitFor();
  while (corruptions.length) {
    await page.click('#notice [data-action=retry]');
    await page.waitForFunction(() => !document.body.classList.contains('busy'));
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('shift-pending')).action.id), requestId);
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('shift-ui-v2')).drafts.some(draft => draft.value === 'My newer unsent thought')), 'newer text remains saved during retry');
  }
  await page.click('#notice [data-action=retry]');
  await page.locator('#transcript .b.them', {hasText: 'A synthetic reply to: Where were you at eight?'}).waitFor();
  await page.waitForFunction(() => sessionStorage.getItem('shift-pending') === null);
  assert.equal(asks.length, expectedAttempts, 'each invalid response and the final confirmed retry');
  assert.ok(asks.every(ask => ask.id === requestId), 'every retry uses the original request id');
  assert.equal(await page.locator('#transcript .b.me').count(), 1, 'only one question was spent');
  assert.equal((await server.store.getRoom(code)).players[0].interviews[0].messages.length, 1);
  assert.equal(await page.inputValue('#question'), 'My newer unsent thought');
  await page.reload();
  await page.locator('#question').waitFor();
  assert.equal(await page.inputValue('#question'), 'My newer unsent thought', 'newer text survives final acknowledgement and reload');
  // A destroyed chat cannot rescue a failed acknowledgement: recovery belongs to the app.
  await page.unroute('**/actions');
  let release, arrived;
  const intercepted = new Promise(resolve => { arrived = resolve; });
  let held = true;
  await page.route('**/actions', async route => {
    if (!held || route.request().postDataJSON()?.type !== 'ask') return route.continue();
    held = false;
    const response = await route.fetch(), data = await response.json();
    arrived();
    await new Promise(resolve => { release = resolve; });
    data.me.interviews.at(-1).messages = [null];
    return route.fulfill({response, json: data});
  });
  await page.fill('#question', 'Second delivered question');
  await page.press('#question', 'Enter');
  await intercepted;
  await page.fill('#question', 'Thought saved while sending');
  await page.click('[data-tab=deductions]');
  release();
  await page.locator('#notice [data-action=retry]').waitFor();
  const secondId = asks.at(-1).id;
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('shift-pending')).action.id), secondId);
  await page.click('#notice [data-action=retry]');
  await page.waitForFunction(() => sessionStorage.getItem('shift-pending') === null);
  assert.equal(asks.at(-1).id, secondId);
  assert.equal((await server.store.getRoom(code)).players[0].interviews[0].messages.length, 2);
  await page.click('[data-tab=investigate]');
  assert.equal(await page.inputValue('#question'), 'Thought saved while sending');
  assert.deepEqual(errors, []);
  console.log('Browser response recovery passed: invalid seat/nested records, truncated JSON, null, wrong room, 204 and render faults preserve idempotent retries and newer drafts.');
} finally { await browser.close(); await server.close(); }
