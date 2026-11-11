// Real-browser recovery: a reload keeps the session and the draft, a lost response is retried
// with the same request id, a pending last reply holds the turn transition, and a confirmation
// never acts on a turn that has moved on. Synthetic case and fake AI only; no network.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';

const server = await startFakeAiServer({delay: 1500});
const browser = await launchBrowser();
const shot = process.env.SHIFT_SCREENSHOTS ?? '/tmp';
// Two synthetic agents play on the server; this browser is the host.
const agents = ['Bo', 'Cy'].map(name => ({name, session: `session-${name}`}));
const agentAct = (code, agent, action) => server.game.act(code, agent.session, {id: randomUUID(), ...action});
async function agentTurn(code, agent, round, suspectId, questions = 3) {
  await agentAct(code, agent, {type: 'select', round, suspectId});
  for (let i = 0; i < questions; i++) {
    for (let tries = 0; ; tries++) {
      try { await agentAct(code, agent, {type: 'ask', round, question: `Question ${i + 1} from ${agent.name}?`}); break; }
      catch (error) { if (!/Wait for the answer/.test(error.message) || tries > 40) throw error; await new Promise(r => setTimeout(r, 150)); }
    }
  }
}
const ask = async (page, question, n) => {
  await page.fill('#question', question);
  await page.press('#question', 'Enter');
  await page.waitForFunction(n => document.querySelector('.chead .count')?.textContent.trim().endsWith(`${n} of 3`), n);
};

try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/actions')) { const body = r.postDataJSON(); if (body?.type !== 'heartbeat') requests.push(body); } });
  page.setDefaultTimeout(15000);
  const sent = type => requests.filter(r => r.type === type);

  await page.goto(server.origin);
  await page.fill('#create-name', 'Ada');
  await page.click('#create-form button');
  const code = (await page.locator('.room-code').textContent()).trim();
  for (const agent of agents) await server.game.join(code, agent.session, agent.name, randomUUID());
  await page.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled, null, {timeout: 6000});
  await page.click('[data-action=start]');
  await page.click('[data-action=begin]');
  await page.click('[data-suspect=suspect-1]');
  await page.click('[data-action=question]');
  await page.locator('#question').waitFor();

  // A reload keeps the room, the open chat and the unsent draft.
  await page.fill('#question', 'Half a thought about the');
  await page.reload();
  await page.locator('#question').waitFor();
  assert.equal(await page.inputValue('#question'), 'Half a thought about the');
  assert.match(await page.locator('.chead').textContent(), /Character 1/);

  // The first answer to this question is lost on the way back. The question reached the server;
  // the retry after a reload carries the same id and nothing is asked twice.
  let lose = true;
  await page.route('**/actions', async route => {
    if (lose && route.request().postDataJSON()?.type === 'ask') { lose = false; await route.fetch(); return route.abort('failed'); }
    return route.continue();
  });
  await page.fill('#question', 'Where were you at eight?');
  await page.press('#question', 'Enter');
  await page.locator('#notice.error', {hasText: 'Connection lost'}).waitFor();
  assert.equal(await page.locator('#notice [data-action=retry]').count(), 1);
  await page.reload();
  await page.locator('#transcript .b.them', {hasText: 'A synthetic reply to: Where were you at eight?'}).waitFor();
  const asks = sent('ask');
  assert.equal(asks.length, 2, 'one lost attempt and one retry');
  assert.equal(asks[1].id, asks[0].id, 'the retry reuses the request id');
  assert.equal(await page.locator('#transcript .b.me').count(), 1, 'the question is asked once');
  assert.equal((await page.locator('.chead .count').textContent()).trim().slice(-6), '1 of 3');
  await page.unroute('**/actions');

  // Both agents finish turn 1, so my third question ends the turn while its reply is still on the way.
  await Promise.all(agents.map((agent, i) => agentTurn(code, agent, 1, `suspect-${i + 2}`)));
  await ask(page, 'What did you notice?', 2);
  await page.locator('#transcript .typing').waitFor({state: 'detached'});
  await page.fill('#question', 'Who else was there?');
  await page.press('#question', 'Enter');
  await page.locator('#transcript .typing').waitFor();
  await page.waitForFunction(code => fetch(`/api/rooms/${code}/state`).then(r => r.json()).then(s => s.round === 2), code);
  assert.equal(await page.locator('.screen.transition').count(), 0, 'no transition while my reply is pending');
  await page.locator('#transcript .b.them', {hasText: 'Who else was there?'}).waitFor();
  await page.locator('.done', {hasText: "That's all your questions for this turn."}).waitFor();
  await page.waitForTimeout(3000);
  assert.equal(await page.locator('.screen.transition').count(), 0, 'the late reply stays on screen until I move on');
  assert.equal(await page.locator('#transcript .b.me').count(), 3);
  await page.click('.done button');
  await page.locator('.screen.transition', {hasText: '6 hours later'}).waitFor();
  assert.match(await page.locator('.transition .time').textContent(), /02:00/);
  await page.locator('.screen.pick').waitFor();

  // Turn 2: I finish first. Cancel sends nothing; a confirmation left open when the turn moves on closes itself.
  await page.click('[data-suspect=suspect-4]');
  await page.click('[data-action=question]');
  for (const [i, q] of ['When did you arrive?', 'What did you see?', 'Who did you meet?'].entries()) {
    await ask(page, q, i + 1);
    await page.locator('#transcript .typing').waitFor({state: 'detached'});
  }
  await page.click('.done button');
  await page.getByText('Waiting for: Bo, Cy').waitFor();
  await page.click('[data-action=advance]');
  await page.locator('#confirm-dialog[open]').waitFor();
  await page.click('#confirm-cancel');
  await page.locator('#confirm-dialog').waitFor({state: 'hidden'});
  await page.click('[data-action=advance]');
  await page.locator('#confirm-dialog[open]').waitFor();
  await Promise.all(agents.map((agent, i) => agentTurn(code, agent, 2, `suspect-${i + 5}`)));
  await page.locator('#confirm-dialog').waitFor({state: 'hidden'});
  await page.locator('.screen.transition', {hasText: '6 hours later'}).waitFor();
  assert.equal(sent('advance').length, 0, 'no advance was sent');
  await page.screenshot({path: `${shot}/shift-recovery-transition.png`});
  await page.locator('.screen.pick').waitFor();
  assert.match(await page.locator('#header .clock').textContent(), /Turn 3 of 4 · 08:00/);
  assert.deepEqual(errors, []);
  console.log('Browser recovery passed: reload keeps session and draft, lost response retried with the same id, pending reply holds the transition, stale confirmation closes.');
} finally {
  await browser.close();
  await server.close();
}
