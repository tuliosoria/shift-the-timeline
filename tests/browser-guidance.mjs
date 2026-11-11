// Phone onboarding and dossier regression. Public fixture, local authored dialogue and fake AI only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from '../server/http.mjs';
import {createApi} from '../server/api.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {Sessions} from '../server/sessions.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {TRAIN_CASE, CASES} from './fixtures/case.mjs';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';

const store = new MemoryStore();
const game = new DurableGame({store, caseData: TRAIN_CASE, catalog: CASES});
let api;
const server = createServer({api: (...args) => api(...args), origin: 'http://127.0.0.1'});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
api = createApi({game, sessions: new Sessions({store, secure: false}), allowedOrigin: origin, rateLimit: async () => {}});
let browser, aiServer;
try {
  browser = await launchBrowser();
  for (const width of [320, 390]) {
    const context = await browser.newContext({viewport: {width, height: 740}, reducedMotion: 'reduce'});
    const page = await context.newPage(), errors = [], mutations = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/actions')) mutations.push(request.postDataJSON());
    });
    await page.goto(origin);
    await page.locator('.ai-notice', {hasText: 'Suspects use authored replies.'}).waitFor();
    assert.match(await page.locator('.table-guide').textContent(), /3–4 players · one phone each/);
    assert.doesNotMatch(await page.locator('.ai-notice').textContent(), /voiced by AI/);
    await page.click('[data-entry=join]');
    assert.ok(await page.locator('.table-guide').isVisible(), 'joiners see the table requirements too');
    await page.click('[data-entry=create]');
    await page.fill('#create-name', 'Ada');
    await page.click('#create-form button');
    const code = (await page.locator('.room-code').textContent()).trim();
    assert.match(await page.locator('.ai-notice').textContent(), /Suspects use authored replies/);
    await page.reload();
    await page.locator('.lobby').waitFor();
    assert.match(await page.locator('.ai-notice').textContent(), /Suspects use authored replies/);
    for (const name of ['Bo', 'Cy']) await game.join(code, `guidance-${width}-${name}`, name, randomUUID());
    await page.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled);
    await page.click('[data-action=start]');
    await page.click('[data-action=begin]');
    await page.click('[data-suspect=suspect-14]');
    const dossier = page.locator('#suspect-dossier');
    await dossier.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'suspect-dossier');
    assert.match(await dossier.textContent(), /Character 14.*Synthetic dossier for development/s);
    assert.doesNotMatch(await page.locator('#main').textContent(), /Synthetic private brief/);
    assert.equal(mutations.filter(m => ['select', 'ask'].includes(m.type)).length, 0, 'browsing profiles never commits the turn');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    const dossierBox = await dossier.boundingBox();
    assert.ok(dossierBox.y >= 0 && dossierBox.y + dossierBox.height <= 740, `dossier visible at ${width}px`);
    await page.waitForTimeout(2800); // real poll must preserve the focused dossier
    assert.equal(await page.evaluate(() => document.activeElement.id), 'suspect-dossier');
    await page.click('[data-suspect=suspect-14]');
    assert.equal(await dossier.count(), 0, 'the selection can be cleared');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'suspect-choice-suspect-14');
    await page.focus('[data-suspect=suspect-1]');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'suspect-dossier');
    assert.match(await dossier.textContent(), /Character 1/);
    await page.click('[data-action=question]');
    await page.locator('#question').waitFor();
    assert.equal(mutations.filter(m => m.type === 'select').length, 1);
    assert.equal(mutations.find(m => m.type === 'select').suspectId, 'suspect-1');
    assert.equal(mutations.filter(m => m.type === 'ask').length, 0);
    assert.deepEqual(errors, []);
    await context.close();
  }

  aiServer = await startFakeAiServer();
  const context = await browser.newContext({viewport: {width: 390, height: 740}});
  const page = await context.newPage();
  await page.goto(aiServer.origin);
  await page.locator('.ai-notice', {hasText: 'Suspects are voiced by AI.'}).waitFor();
  assert.match(await page.locator('.ai-notice').textContent(), /Don't type personal information/);
  assert.match(await page.locator('.ai-notice').textContent(), /Authored replies take over/);
  await page.fill('#create-name', 'Ada');
  await page.click('#create-form button');
  await page.locator('.lobby').waitFor();
  assert.match(await page.locator('.ai-notice').textContent(), /Suspects are voiced by AI/);
  await context.close();
  console.log('Phone guidance passed at 320/390px: truthful modes, dossier focus, private fields excluded, no browsing mutations.');
} finally {
  await browser?.close();
  await aiServer?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
