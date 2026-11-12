// Three real isolated phones and actual admission/worker/HTTP paths. Synthetic
// responses inspect context isolation and recovery, NOT model naturalness.
import assert from 'node:assert/strict';
import {launchBrowser} from './helpers/browser.mjs';
import {startConversationServer} from './helpers/conversation-server.mjs';

const LATE = 'Peer private reply held across turns';
const server = await startConversationServer({heldQuestions:[LATE]});
let browser;
const errors = [], external = [], shot = process.env.SHIFT_SCREENSHOTS ?? '/tmp';
const state = (page, code) => page.evaluate(async code => (await fetch(`/api/rooms/${code}/state`)).json(), code);
const captured = question => server.calls.filter(c => c.input.question === question);
const questions = call => call.input.history.map(h => h.question);
async function ask(page, question, count, {pending = false} = {}) {
  await page.fill('#question', question); await page.press('#question', 'Enter');
  await page.waitForFunction(n => document.querySelectorAll('#transcript .b.me').length === n, count);
  if (pending) await page.locator('#transcript .typing').waitFor();
  else await page.waitForFunction(() => !document.querySelector('#transcript .typing'));
}
async function pick(page, suspect) {
  await page.locator('.screen.pick').waitFor();
  await page.click(`[data-suspect=${suspect}]`); await page.click('[data-action=question]');
  await page.locator('#question').waitFor();
}
async function advance(host) {
  await host.click('[data-action=leave-chat]');
  await host.click('[data-action=advance]');
  await host.locator('#confirm-dialog[open]').waitFor();
  await host.click('#confirm-accept');
  await host.click('[data-action=continue]');
}
try {
  browser = await launchBrowser();
  const pages = [];
  for (const width of [390, 320, 390]) {
    const context = await browser.newContext({viewport:{width, height:740}, reducedMotion:'reduce'});
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.origin) {
        external.push(route.request().url()); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.origin); pages.push(page);
  }
  const [host, peer, other] = pages;
  await host.fill('#create-name', 'Host'); await host.click('#create-form button');
  const code = (await host.locator('.room-code').textContent()).trim();
  for (const [index, page] of pages.slice(1).entries()) {
    await page.goto(`${server.origin}/#join=${code}`);
    await page.fill('#join-name', ['Peer', 'Other'][index]); await page.click('#join-form button');
    await page.locator('.screen.lobby').waitFor();
  }
  await host.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled);
  await host.click('[data-action=start]');
  for (const [index, page] of pages.entries()) {
    await page.click('[data-action=begin]'); await pick(page, index === 2 ? 'suspect-2' : 'suspect-1');
  }

  await ask(host, 'Host first private question', 1);
  await ask(host, 'Host first private question', 2);
  assert.equal(captured('Host first private question').length, 2, 'deliberate repetition makes two admitted calls');
  assert.deepEqual(questions(captured('Host first private question')[1]), ['Host first private question']);
  assert.match(await host.locator('.chead .count').textContent(), /2 of 3/);
  await ask(host, 'Host last question in the first visit', 3);
  await ask(other, 'Other player private question', 1);
  await ask(peer, 'Peer first private question', 1);
  await ask(peer, LATE, 2, {pending:true});
  for (let attempt = 0; !captured(LATE).length && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(captured(LATE).length, 1, 'held reply reached the synthetic provider');
  assert.deepEqual(questions(captured(LATE)[0]), ['Peer first private question']);
  const pendingContext = JSON.stringify(captured(LATE)[0].context);
  const pendingJob = [...server.store.ai.values()].find(job => job.kind === 'job' && JSON.parse(job.context.input).question === LATE);
  assert.ok(pendingJob);
  const storedPendingContext = JSON.stringify(pendingJob.context);
  await peer.fill('#question', 'Unsent peer thought from turn one');
  await peer.locator('#question').blur();

  // Host advances while a different phone is still waiting. That old chat stays
  // read-only; a reload must not reopen it for writing in the new turn.
  await advance(host);
  await peer.reload();
  await peer.locator('#transcript .typing').waitFor();
  assert.equal(await peer.locator('.screen.pick').count(), 0);
  assert.equal(await peer.locator('#question').evaluate(field => field.readOnly), true, 'closed historical composer stays read-only');
  assert.equal(await peer.locator('.send').isDisabled(), true, 'old interview cannot submit in the new turn');
  assert.equal(await peer.evaluate(() => JSON.parse(localStorage.getItem('shift-ui-v2')).drafts.find(d => d.context.round === 1)?.value), 'Unsent peer thought from turn one', 'old draft remains saved under its original turn');
  assert.equal((await state(peer, code)).round, 2);
  await pick(host, 'suspect-2');
  for (const [i, question] of ['Host other suspect one', 'Host other suspect two', 'Host other suspect three'].entries()) await ask(host, question, i + 1);
  await advance(host); await pick(host, 'suspect-1');

  await host.fill('#question', 'Host revisit draft'); await host.locator('#question').blur();
  await host.reload(); await host.locator('#question').waitFor();
  assert.equal(await host.inputValue('#question'), 'Host revisit draft');
  await ask(host, 'Host revisit after another suspect', 1);
  const revisit = captured('Host revisit after another suspect')[0];
  assert.deepEqual(questions(revisit), ['Host first private question', 'Host first private question', 'Host last question in the first visit']);
  assert.deepEqual(revisit.input.history.map(h => h.round), [1, 1, 1]);
  assert.equal(revisit.input.conversation.currentRound, 3);
  assert.ok(!JSON.stringify(revisit).includes('Peer first private question'));
  assert.ok(!JSON.stringify(revisit).includes('Other player private question'));
  assert.ok(!JSON.stringify(revisit).includes('Host other suspect one'));
  assert.equal(JSON.stringify(captured(LATE)[0].context), pendingContext, 'provider received an immutable admission snapshot');
  assert.equal(JSON.stringify((await server.store.getAi(`AIJOB#${pendingJob.id}`)).context), storedPendingContext, 'durable queued context is unchanged across host advances');

  server.release(LATE);
  await peer.locator('#transcript .b.them', {hasText:`Synthetic testimony: ${LATE}`}).waitFor();
  await peer.click('[data-action=leave-chat]'); await peer.click('[data-action=continue]');
  await pick(peer, 'suspect-1');
  await ask(peer, 'Peer revisit after the late reply', 1);
  const peerRevisit = captured('Peer revisit after the late reply')[0];
  assert.deepEqual(questions(peerRevisit), ['Peer first private question', LATE]);
  assert.deepEqual(peerRevisit.input.history.map(h => h.round), [1, 1]);
  assert.equal(peerRevisit.input.history[1].reply, `Synthetic testimony: ${LATE}`);
  assert.ok(!JSON.stringify(peerRevisit).includes('Host first private question'));

  // Private archive and unsent historical draft survive advancement and reload.
  await peer.click('#tabbar [data-tab=deductions]'); await peer.click('[data-notebook=interviews]');
  await peer.click('[data-interview="1:suspect-1"]');
  await peer.reload(); await peer.locator('.review').waitFor();
  assert.equal(await peer.locator('#question').count(), 0);
  assert.match(await peer.locator('.review').textContent(), /Unsent peer thought from turn one/);
  assert.ok(!(await peer.locator('.review').textContent()).includes('Host first private question'));
  for (const page of pages) {
    const own = JSON.stringify(await state(page, code));
    const forbidden = page === host ? ['Peer first private question', 'Other player private question']
      : page === peer ? ['Host first private question', 'Other player private question']
        : ['Host first private question', 'Peer first private question'];
    for (const text of forbidden) assert.ok(!own.includes(text), 'HTTP projection contains only own private transcript');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone has no horizontal overflow');
  }
  await peer.screenshot({path:`${shot}/shift-conversation-memory-320.png`});
  await host.screenshot({path:`${shot}/shift-conversation-revisit-390.png`});
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(server.failures, []);
  console.log('Conversation memory browser passed: three private phones, repetition, late reply, immutable queued context, other-suspect exclusion, revisits, reload and archived draft. Synthetic transport only.');
} finally { await browser?.close(); await server.close(); }
