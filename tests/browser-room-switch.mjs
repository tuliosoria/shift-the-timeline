// Safe local room switching through real HTTP. Synthetic rooms and delayed fake AI only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';

const server = await startFakeAiServer({delay: 700});
const errors = [], external = [], requests = [];
let browser, releasePoll = () => {};
const snapshot = (page, code) => page.evaluate(async code => (await fetch(`/api/rooms/${code}/state`)).json(), code);
const roomCode = async page => (await page.locator('.room-code').first().textContent()).trim();
const invite = (page, code) => page.evaluate(code => { location.hash = `join=${code}`; }, code);
const joins = () => requests.filter(r => /\/join$/.test(r.url));
async function leave(page) {
  await page.click('[data-action=switch-room]');
  await page.locator('#confirm-dialog[open]').waitFor();
  await page.click('#confirm-accept');
  await page.locator('#join-code').waitFor();
}
async function returnByCode(page, code) {
  await page.fill('#join-code', code);
  await page.fill('#join-name', 'Returning agent');
  await page.click('#join-form button');
}
try {
  browser = await launchBrowser();
  const pages = [];
  for (const width of [320, 390, 390]) {
    const context = await browser.newContext({viewport: {width, height: 740}, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST') requests.push({page, url: request.url(), body: request.postDataJSON()});
    });
    await page.goto(server.origin);
    await page.fill('#create-name', ['Ada', 'Bea', 'Cy'][pages.length]);
    await page.click('#create-form button');
    await page.locator('.lobby').waitFor();
    pages.push(page);
  }
  const [page, second, third] = pages;
  const [a, b, c] = await Promise.all(pages.map(roomCode));
  await server.game.join(a, 'synthetic-agent-one', 'One', randomUUID());
  await server.game.join(a, 'synthetic-agent-two', 'Two', randomUUID());
  const original = await snapshot(page, a);

  // Initial invitation is applied once, not again after a slow catalogue overwrites typing.
  const fresh = await browser.newContext({viewport:{width:390,height:740}});
  const entryPage = await fresh.newPage();
  let catalogueReached, releaseCatalogue;
  const catalogueStarted = new Promise(resolve => { catalogueReached = resolve; });
  const catalogueGate = new Promise(resolve => { releaseCatalogue = resolve; });
  await entryPage.route(url => url.pathname === '/api/cases', async route => { catalogueReached(); await catalogueGate; return route.continue(); });
  await entryPage.goto(`${server.origin}/#join=${b}`); await catalogueStarted;
  assert.equal(await entryPage.inputValue('#join-code'), b);
  await entryPage.fill('#join-code', c); await entryPage.fill('#join-name', 'Typed before loading');
  releaseCatalogue();
  await entryPage.waitForFunction(() => document.querySelector('.ai-notice')?.textContent.includes('voiced by AI'));
  assert.equal(await entryPage.inputValue('#join-code'), c);
  assert.equal(await entryPage.inputValue('#join-name'), 'Typed before loading');
  await fresh.close();


  // Leaving is an explicit local choice. Cancel and Escape neither mutate nor discard the seat.
  for (const dismiss of ['cancel', 'escape']) {
    await page.click('[data-action=switch-room]');
    await page.locator('#confirm-dialog[open]').waitFor();
    assert.match(await page.locator('#confirm-body').textContent(), /seat|place/i);
    if (dismiss === 'cancel') await page.click('#confirm-cancel'); else await page.keyboard.press('Escape');
    assert.equal(await page.locator('#confirm-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(await roomCode(page), a);
  }

  await invite(page, b);
  await page.locator('#confirm-dialog[open]').waitFor();
  await page.click('#confirm-cancel');
  assert.equal(await page.evaluate(() => location.hash), '', 'declining clears the invitation');
  assert.equal(await roomCode(page), a);

  // A newer invitation replaces the old destination, including after page reload.
  await invite(page, b);
  await page.locator('#confirm-dialog[open]').waitFor();
  assert.match(await page.locator('#confirm-body').textContent(), new RegExp(b));
  await invite(page, c);
  await page.waitForFunction(code => document.querySelector('#confirm-body').textContent.includes(code), c);
  await page.reload();
  await page.locator('#confirm-dialog[open]').waitFor();
  assert.match(await page.locator('#confirm-body').textContent(), new RegExp(c));
  await page.click('#confirm-accept');
  await page.locator('#join-code').waitFor();
  assert.equal(await page.inputValue('#join-code'), c);
  await page.reload();
  await page.locator('#join-code').waitFor();
  assert.equal(await page.inputValue('#join-code'), c, 'accepted invitation survives interruption before joining');
  await page.fill('#join-name', 'Ada visiting');
  await invite(page, b);
  await page.waitForFunction(code => document.querySelector('#join-code')?.value === code, b);
  assert.equal(await page.inputValue('#join-name'), 'Ada visiting', 'new invitation preserves typed codename');
  await invite(page, c);
  await page.waitForFunction(code => document.querySelector('#join-code')?.value === code, c);
  await page.goBack();
  await page.waitForFunction(code => document.querySelector('#join-code')?.value === code, b);
  await page.goForward();
  await page.waitForFunction(code => document.querySelector('#join-code')?.value === code, c);
  await invite(page, b);
  await page.waitForFunction(code => document.querySelector('#join-code')?.value === code, b);
  assert.equal(await page.inputValue('#join-name'), 'Ada visiting');
  // A newer invite arriving during a successful join must survive reload too.
  let entryReached, releaseEntry;
  const entryStarted = new Promise(resolve => { entryReached = resolve; });
  const entryGate = new Promise(resolve => { releaseEntry = resolve; });
  const slowEntry = async route => { const response = await route.fetch(); entryReached(); await entryGate; return route.fulfill({response}); };
  await page.route(`**/api/rooms/${b}/join`, slowEntry);
  await page.click('#join-form button'); await entryStarted;
  await invite(page, c); releaseEntry();
  await page.locator('.lobby').waitFor();
  await page.locator('#confirm-dialog[open]').waitFor();
  assert.equal(await page.evaluate(() => location.hash), `#join=${c}`);
  await page.reload();
  await page.locator('#confirm-dialog[open]').waitFor();
  assert.match(await page.locator('#confirm-body').textContent(), new RegExp(c));
  await page.click('#confirm-cancel');
  await page.unroute(`**/api/rooms/${b}/join`, slowEntry);
  assert.equal(await roomCode(page), b);
  assert.equal((await snapshot(page, b)).players.length, 2);
  assert.equal((await snapshot(page, a)).players.length, 3, 'switching does not remove the old seat');

  // Reopening the original started or unstarted room uses GET, never a duplicate POST join.
  const joined = joins().length;
  await leave(page);
  await returnByCode(page, a);
  await page.locator('.lobby').waitFor();
  assert.equal(await roomCode(page), a);
  assert.equal(joins().length, joined);
  assert.equal((await snapshot(page, a)).me.id, original.me.id);
  await invite(page, a);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#confirm-dialog').evaluate(dialog => dialog.open), false, 'own invitation does not leave room');
  await page.click('[data-action=start]');
  await page.click('[data-action=begin]');
  await page.click('[data-suspect=suspect-0]');
  await page.click('[data-action=question]');
  await page.fill('#question', 'An unsent private thought');
  await page.locator('#question').blur();
  await page.click('#tabbar [data-tab=deductions]');
  await page.click('[data-notebook=interviews]');
  await page.click('[data-interview="1:suspect-0"]');
  await invite(page, b);
  await page.locator('#confirm-dialog[open]').waitFor();
  await page.click('#confirm-accept');
  await page.locator('[data-action=resume]').waitFor();
  await page.reload();
  await page.locator('[data-action=resume]').waitFor();
  // A failed reconnect read never creates a seat or loses the parked room.
  const unavailable = route => route.fulfill({status:503, contentType:'application/json', body:JSON.stringify({error:'Service temporarily unavailable. Please try again.'})});
  await page.route(`**/api/rooms/${a}/state`, unavailable);
  await page.click('[data-action=resume]');
  await page.locator('#notice.error', {hasText:'Could not reconnect'}).waitFor();
  assert.equal(await page.locator('[data-action=resume]').count(), 1);
  assert.equal(joins().length, joined);
  await page.unroute(`**/api/rooms/${a}/state`, unavailable);
  // A newer invitation during the reconnect read waits instead of disappearing.
  let readReached, releaseRead;
  const readStarted = new Promise(resolve => { readReached = resolve; });
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  const slowResume = async route => { readReached(); await readGate; return route.continue(); };
  await page.route(`**/api/rooms/${a}/state`, slowResume);
  await page.click('[data-action=resume]'); await readStarted;
  await invite(page, b);
  assert.equal(await page.locator('#confirm-dialog').evaluate(dialog => dialog.open), false);
  releaseRead();
  await page.locator('.review').waitFor();
  await page.locator('#confirm-dialog[open]').waitFor();
  assert.match(await page.locator('#confirm-body').textContent(), new RegExp(b));
  await page.click('#confirm-cancel');
  await page.unroute(`**/api/rooms/${a}/state`, slowResume);
  assert.match(await page.locator('.saved-draft').textContent(), /An unsent private thought/);
  await page.click('#tabbar [data-tab=investigate]');
  assert.equal(await page.inputValue('#question'), 'An unsent private thought');
  assert.equal(joins().length, joined, 'resume uses no join mutation');

  // A lost write acknowledgement prevents leaving until its exact request is safely retried.
  let dropped = false;
  const loseAnswer = async route => {
    if (route.request().postDataJSON()?.type !== 'ask' || dropped) return route.continue();
    dropped = true; await route.fetch(); return route.abort('failed');
  };
  await page.route('**/actions', loseAnswer);
  await page.fill('#question', 'Where did my question go?');
  await page.press('#question', 'Enter');
  await page.locator('#notice.error [data-action=retry]').waitFor();
  await page.locator('#question').blur();
  await page.click('#tabbar [data-tab=case]');
  const switchButton = page.locator('[data-action=switch-room]');
  assert.equal(await switchButton.isDisabled(), true, 'uncertain write locks switching');
  await invite(page, b);
  assert.equal(await page.locator('#confirm-dialog').evaluate(dialog => dialog.open), false, 'invitation waits for held write');
  await page.click('#notice [data-action=retry]');
  await page.waitForFunction(() => !document.querySelector('[data-action=switch-room]')?.disabled);
  await page.locator('#confirm-dialog[open]').waitFor();
  assert.match(await page.locator('#confirm-body').textContent(), new RegExp(b));
  await page.click('#confirm-cancel');
  await page.unroute('**/actions', loseAnswer);
  const asks = requests.filter(r => r.page === page && r.body?.type === 'ask');
  assert.equal(asks.length, 2);
  assert.deepEqual(asks[0].body, asks[1].body);
  assert.equal((await snapshot(page, a)).me.interviews[0].messages.length, 1);

  // An expired-state response from the previous room cannot evict the new selection.
  let reachedPoll;
  const intercepted = new Promise(resolve => { reachedPoll = resolve; });
  const gate = new Promise(resolve => { releasePoll = resolve; });
  const stalePoll = async route => {
    if (!route.request().url().includes('since=')) return route.continue();
    reachedPoll(); await gate;
    return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({error: 'Room not found or expired.'})});
  };
  await page.route(`**/api/rooms/${a}/state?*`, stalePoll);
  await intercepted;
  await leave(page);
  await returnByCode(page, b);
  await page.locator('.lobby').waitFor();
  assert.equal(await roomCode(page), b);
  releasePoll();
  await page.waitForTimeout(400);
  await page.unroute(`**/api/rooms/${a}/state?*`, stalePoll);
  assert.equal(await roomCode(page), b, 'old-room 404 did not reset current session');
  assert.equal(joins().length, joined, 'returning to either room never creates another seat');

  await page.click('[data-action=switch-room]');
  await page.locator('#confirm-dialog[open]').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '320px layout has no horizontal overflow');
  const shot = process.env.SHIFT_SCREENSHOTS;
  if (shot) { await mkdir(shot, {recursive: true}); await page.screenshot({path: join(shot, 'room-switch-320.png'), fullPage: true}); }
  await page.keyboard.press('Escape');
  assert.deepEqual(requests.filter(r => r.body?.type && !['start', 'select', 'ask', 'heartbeat'].includes(r.body.type)), [], 'switching sends no game mutation');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.equal((await snapshot(page, a)).players.length, 3);
  assert.equal((await snapshot(second, b)).players.length, 2);
  assert.equal((await snapshot(third, c)).players.length, 1, 'superseded invite never joined');
  console.log('Room switching browser checks passed: invites, resume, drafts, pending retries, stale polls and narrow layout.');
} finally {
  releasePoll();
  await browser?.close();
  await server.close();
}
