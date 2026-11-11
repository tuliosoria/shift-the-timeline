// A full three-phone game of the public demo in real browsers: canonical answers (AI off),
// local MemoryStore, no credentials or external services. Authored-route regression, not a solver.
import assert from 'node:assert/strict';
import {createServer} from '../server/http.mjs';
import {createApi} from '../server/api.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {Sessions} from '../server/sessions.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {caseData, catalog} from '../examples/public-demo.mjs';
import {launchBrowser} from './helpers/browser.mjs';

const data = validateCase({caseData, catalog}), store = new MemoryStore();
let api;
const server = createServer({api: (...args) => api(...args), origin: 'http://127.0.0.1'});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
api = createApi({game: new DurableGame({store, ...data}), sessions: new Sessions({store, secure: false}), allowedOrigin: origin, rateLimit: async () => {}});
const shot = process.env.SHIFT_SCREENSHOTS ?? '/tmp';
const NAMES = ['Host', 'Agent Bo', 'Agent Cy'];
// Who each agent questions per turn; alibi and observation questions open source-triggered deductions.
const PLAN = [['rowan', 'basil', 'hugo'], ['kit', 'ada', 'cora'], ['leena', 'oscar', 'nell'], ['priya', 'gia', 'dev']];
const QUESTIONS = ['Where were you at the time?', 'What did you notice?', 'How did you know the victim?'];
const TIMES = ['18:00', '00:00', '06:00', '12:00'];
const browser = await launchBrowser();
const errors = [], external = [];
const overflow = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow');
const turnLabel = (page, turn) => page.waitForFunction(t => document.querySelector('#header .clock')?.textContent.startsWith(`Turn ${t} of 4`), turn);

async function open(context) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.goto(origin);
  return page;
}
async function pick(page, suspectId, screenshot) {
  await page.locator('.screen.pick').waitFor();
  await page.click(`[data-suspect="${suspectId}"]`);
  if (screenshot) await page.screenshot({path: screenshot});
  await page.click('[data-action=question]');
  await page.locator('#question').waitFor();
}
async function ask(page, question, n) {
  await page.fill('#question', question);
  await page.press('#question', 'Enter');
  await page.waitForFunction(n => document.querySelector('.chead .count')?.textContent.trim().endsWith(`${n} of 3`), n);
}
async function confirm(page, pattern) {
  await page.locator('#confirm-dialog[open]').waitFor();
  if (pattern) assert.match(await page.locator('#confirm-body').textContent(), pattern);
  await page.click('#confirm-accept');
  await page.locator('#confirm-dialog').waitFor({state: 'hidden'});
}
async function questionAll(page, suspectId, {first = false} = {}) {
  await pick(page, suspectId, first && `${shot}/shift-pick.png`);
  for (const [i, q] of QUESTIONS.entries()) await ask(page, q, i + 1);
  await page.locator('.done', {hasText: "That's all your questions for this turn."}).waitFor();
}
const deductionCount = async page => Number((await page.locator('[data-tab=deductions] small').textContent()).split('/')[0]);

try {
  const contexts = [], pages = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
    contexts.push(context);
    pages.push(await open(context));
  }

  // Lobby: the host opens the case, two agents join through the invite link.
  await pages[0].fill('#create-name', NAMES[0]);
  if (await pages[0].locator('#case-choice').count()) await pages[0].selectOption('#case-choice', caseData.id);
  await pages[0].click('#create-form button');
  const code = (await pages[0].locator('.room-code').textContent()).trim();
  for (const i of [1, 2]) {
    await pages[i].goto(`${origin}/#join=${code}`);
    await pages[i].locator('#join-code').waitFor();
    assert.equal(await pages[i].inputValue('#join-code'), code);
    await pages[i].fill('#join-name', NAMES[i]);
    await pages[i].click('#join-form button');
    await pages[i].locator('.room-code').waitFor();
  }
  await pages[0].waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled);
  await pages[0].click('[data-action=start]');
  for (const page of pages) {
    await page.locator('.screen.briefing').waitFor();
    assert.match(await page.locator('.briefing').textContent(), /24 hours/);
    await page.click('[data-action=begin]');
    await turnLabel(page, 1);
  }

  for (let turn = 1; turn <= 4; turn++) {
    const plan = PLAN[turn - 1];
    for (const page of pages) assert.match(await page.locator('#header .clock').textContent(), new RegExp(`Turn ${turn} of 4 · ${TIMES[turn - 1]}`));

    // The host finishes first and waits for the others by name.
    await questionAll(pages[0], plan[0], {first: turn === 1});
    if (turn === 1) {
      const toast = pages[0].locator('#toasts .toast', {hasText: 'Deduction unlocked'}).first();
      await toast.waitFor({state: 'attached'});
      assert.equal(await pages[0].evaluate(() => document.activeElement?.closest('#toasts')), null, 'a toast never takes focus');
      await pages[0].screenshot({path: `${shot}/shift-chat.png`});
    }
    await pages[0].click('.done button');
    await pages[0].getByText('Your turn is done.').waitFor();
    await pages[0].getByText(`Waiting for: ${NAMES[1]}, ${NAMES[2]}`).waitFor();
    if (turn === 1) { await overflow(pages[0]); await pages[0].screenshot({path: `${shot}/shift-waiting.png`}); }
    assert.equal(await pages[1].locator('[data-action=advance]').count(), 0, 'only the host may advance');

    await questionAll(pages[1], plan[1]);
    await pages[1].click('.done button');
    await pages[0].getByText(`Waiting for: ${NAMES[2]}`, {exact: true}).waitFor();

    if (turn === 2) {
      // Agent Cy asks once and walks away mid-turn (closes the tab). The host advances for the table.
      await pick(pages[2], plan[2]);
      await ask(pages[2], QUESTIONS[0], 1);
      await pages[2].close();
      await pages[0].click('[data-action=advance]');
      await confirm(pages[0], /loses their remaining questions/);
    } else {
      // The last agent's third answer ends the turn for everyone; they read it before moving on.
      const expected = turn < 4 ? '6 hours later' : "Time's up";
      const othersSee = Promise.all([0, 1].map(i => pages[i].locator('.screen.transition', {hasText: expected}).waitFor({timeout: 10000}).then(() => true, () => false)));
      await questionAll(pages[2], plan[2]);
      await pages[2].waitForTimeout(3000);
      assert.equal(await pages[2].locator('.screen.transition').count(), 0, 'the last reply stays until Continue');
      await pages[2].click('.done button');
      await pages[2].locator('.screen.transition', {hasText: expected}).waitFor();
      assert.match(await pages[2].locator('.transition .time').textContent(), new RegExp(turn < 4 ? TIMES[turn] : caseData.clockStart));
      assert.equal(await pages[2].locator('#header').isHidden(), true, 'the transition is full screen');
      // Mid-way through the 2.5 s interlude, once the hour has landed.
      if (turn === 1 || turn === 4) { await pages[2].waitForTimeout(1400); await pages[2].screenshot({path: `${shot}/shift-${turn === 1 ? 'transition' : 'times-up'}.png`}); }
      assert.deepEqual(await othersSee, [true, true], 'the waiting agents see the transition too');
    }

    if (turn === 2) {
      // The absent agent comes back on the new turn with the earlier conversation intact.
      pages[2] = await open(contexts[2]);
      await turnLabel(pages[0], 3);
      await pages[2].locator('.screen.transition', {hasText: '6 hours later'}).waitFor();
      const state = await pages[2].evaluate(async code => (await fetch(`/api/rooms/${code}/state`)).json(), code);
      const earlier = state.me.interviews.find(i => i.round === 2);
      assert.equal(earlier.suspectId, PLAN[1][2]);
      assert.equal(earlier.messages.length, 1);
      assert.ok(earlier.messages[0].reply, 'the earlier answer is kept');
      assert.equal(earlier.closed, true);
    }
    if (turn < 4) for (const page of pages) {
      await turnLabel(page, turn + 1);
      await page.locator('.screen.pick').waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'main', 'after the transition moves on by itself, focus is on the new screen');
    }
  }

  // Time's up, then every agent summons on their own.
  for (const page of pages) {
    await page.locator('.screen.accuse').waitFor();
    assert.ok(await deductionCount(page) > 0, 'Deductions tab counts what this agent unlocked');
  }
  await pages[0].click('[data-tab=deductions]');
  assert.ok(await pages[0].locator('.dlist .unlocked').count() > 0);
  await pages[0].click('[data-tab=investigate]');
  const votes = ['rowan', 'rowan', 'oscar'];
  for (const [i, page] of pages.entries()) {
    await page.click(`[data-suspect="${votes[i]}"]`);
    await page.click('[data-action=summon]');
    await confirm(page, /This cannot be undone\./);
    if (i < 2) await page.getByText('Your summons is sealed.').waitFor();
  }
  for (const page of pages) await page.locator('.screen.reveal').waitFor();
  const reveal = pages[0].locator('.screen.reveal');
  assert.match(await reveal.locator('.title').textContent(), /The timeline wavers\./);
  assert.match(await reveal.textContent(), /2 of 3 summoned the killer\./);
  assert.match(await reveal.locator('.culprit').textContent(), /Rowan Calder/);
  assert.match(await reveal.locator('.votes').textContent(), /Agent Cy.*Oscar Bell.*Wrong suspect/);
  await overflow(pages[0]);
  await pages[0].screenshot({path: `${shot}/shift-reveal.png`, fullPage: true});
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log('Browser public demo passed: 3 phones, 4 turns, toasts, waiting, absent-agent advance, time is up, summons and reveal.');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(r => server.close(r));
}
