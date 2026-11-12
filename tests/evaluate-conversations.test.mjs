// Fake providers only. Exercise the evaluation driver with real game admission and a durable local ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {loadRuntime, runConversationEvaluation, validateConversationPlan} from '../scripts/evaluate-conversations.mjs';
import {createLedger, openLedger} from '../scripts/evaluation-ledger.mjs';

const runtime = await loadRuntime(fileURLToPath(new URL('..', import.meta.url)));
const rates = {inputRate: 0.10, outputRate: 0.50};
const reservation = runtime.reserveCost({...runtime.PROPOSED_LIMITS, ...rates});
const plan = (visits = [[1, ['Where were you today?']], [2, ['What did you mean by the foyer?']]]) => ({conversations: [{
  id: 'ada-visit', suspectId: 'ada', visits: visits.map(([round, questions]) => ({round, questions: questions.map((question, index) => ({id: `r${round}q${index + 1}`, question}))})),
}]});
const answer = context => ({reply: JSON.parse(context.input).suspect.responses.alibi, unlocked: [], inputTokens: 100, outputTokens: 20});
const provider = action => Object.assign(action ?? (async context => answer(context)), {model: 'synthetic-evaluation-model'});
async function fixture(t, capMicroUsd = 10_000) {
  const directory = await mkdtemp(path.join(tmpdir(), 'shift-conversation-evaluation-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const filename = path.join(directory, 'campaign.json');
  return {filename, options: {capMicroUsd, rates}, ledger: await createLedger(filename, {capMicroUsd, rates})};
}
const run = (ledger, extra = {}) => runConversationEvaluation({runtime, plan: plan(), provider: provider(), ledger,
  runId: 'campaign-one', variant: 'candidate', sourceRevision: 'synthetic-revision', rates, ...extra});

test('multi-visit evaluation reserves before each call and uses real private conversation context', async t => {
  const {ledger} = await fixture(t), contexts = [], snapshots = [];
  const result = await run(ledger, {provider: provider(async (context, options) => {
    const snapshot = await ledger.snapshot(), pending = snapshot.entries.at(-1);
    assert.equal(pending.status, 'reserved');
    assert.equal(pending.reservedMicroUsd, reservation);
    assert.deepEqual(pending.metadata, {runId: 'campaign-one', variant: 'candidate', scenarioId: 'ada-visit',
      questionId: contexts.length ? 'r2q1' : 'r1q1', model: 'synthetic-evaluation-model', sourceRevision: 'synthetic-revision'});
    assert.ok(options.deadline > Date.now());
    contexts.push(JSON.parse(context.input)); snapshots.push(snapshot);
    return answer(context);
  })});
  assert.equal(result.stopped, null);
  assert.deepEqual(result.results.map(row => [row.round, row.status, row.attempted, row.costMicroUsd]), [[1, 'complete', true, 20], [2, 'complete', true, 20]]);
  assert.deepEqual(contexts[0].history, []);
  assert.deepEqual(contexts[1].history, [{round: 1, question: 'Where were you today?', reply: result.results[0].reply}]);
  assert.equal(contexts[1].conversation.currentRound, 2);
  assert.equal(snapshots[1].chargedMicroUsd, reservation + 20);
  for (const row of result.results) {
    assert.match(row.contextSha256, /^[a-f0-9]{64}$/);
    assert.ok(row.contextBytes > 0);
    assert.deepEqual(row.providerUnlocked, []);
  }
  assert.equal((await ledger.snapshot()).chargedMicroUsd, 40);
});

test('ledger exhaustion refuses the call, even though game admission already happened', async t => {
  const {ledger} = await fixture(t, reservation - 1);
  let calls = 0;
  await assert.rejects(run(ledger, {provider: provider(async context => {calls++; return answer(context);})}), /ledger refused request; no paid call was made/);
  assert.equal(calls, 0);
  assert.equal((await ledger.snapshot()).entries.length, 0);
});

test('baseline and candidate use fresh games and distinct reservations against the same campaign cap', async t => {
  const {ledger} = await fixture(t, reservation + 38), observed = [];
  const single = plan([[1, ['Where were you today?']]]);
  const fake = provider(async context => {observed.push(JSON.parse(context.input)); return answer(context);});
  await run(ledger, {plan: single, provider: fake, variant: 'baseline'});
  await run(ledger, {plan: single, provider: fake, variant: 'candidate'});
  await assert.rejects(run(ledger, {plan: single, provider: fake, variant: 'extra'}), /ledger refused/);
  assert.equal(observed.length, 2);
  assert.deepEqual(observed[0], observed[1], 'fresh games present identical first-question inputs for a fixed runtime');
  const state = await ledger.snapshot();
  assert.equal(state.chargedMicroUsd, 40);
  assert.deepEqual(state.entries.map(entry => entry.metadata.variant), ['baseline', 'candidate']);
});

test('reusing a run and variant cannot silently repeat an already paid question after interruption', async t => {
  const {ledger, filename, options} = await fixture(t);
  let calls = 0;
  const fake = provider(async context => {calls++; return answer(context);});
  await assert.rejects(run(ledger, {provider: fake, onResult: async () => {throw new Error('Synthetic report interruption');}}), /report interruption/);
  const reopened = await openLedger(filename, options);
  assert.equal((await reopened.snapshot()).chargedMicroUsd, 20);
  await assert.rejects(run(reopened, {provider: fake}), /ledger refused/);
  assert.equal(calls, 1);
  assert.equal((await reopened.snapshot()).entries.length, 1);
});

test('three consecutive uncertain failures stop the plan without retrying and keep each full reservation', async t => {
  const {ledger, filename, options} = await fixture(t);
  let calls = 0;
  const result = await run(ledger, {plan: plan([[1, ['Where were you?', 'Please clarify.', 'Explain the lights.']], [2, ['One more detail.']]]),
    provider: provider(async () => {calls++; throw new Error('Synthetic timeout after send');})});
  assert.equal(calls, 3);
  assert.equal(result.stopped, 'three_consecutive_fallbacks');
  assert.equal(result.results.length, 3);
  assert.ok(result.results.every(row => row.status === 'canonical' && row.attempted && row.costMicroUsd === reservation));
  const state = await (await openLedger(filename, options)).snapshot();
  assert.equal(state.uncertainMicroUsd, reservation * 3);
  assert.equal(state.actualMicroUsd, 0);
  assert.ok(state.entries.every(entry => entry.status === 'uncertain' && entry.reason === 'uncertain'));
});

test('invalid provider usage cannot release budget and a later successful call resets fallback streak', async t => {
  const {ledger} = await fixture(t);
  let calls = 0;
  const result = await run(ledger, {plan: plan([[1, ['Where were you?', 'Please clarify.', 'Explain the lights.']], [2, ['One more detail.']]]),
    provider: provider(async context => (++calls === 3 ? answer(context) : {...answer(context), inputTokens: -1}))});
  assert.equal(calls, 4);
  assert.equal(result.stopped, null);
  assert.deepEqual(result.results.map(row => row.status), ['canonical', 'canonical', 'complete', 'canonical']);
  const state = await ledger.snapshot();
  assert.equal(state.uncertainMicroUsd, reservation * 3);
  assert.equal(state.actualMicroUsd, 20);
});

test('invalid plans are rejected before any provider or ledger activity', async t => {
  const {ledger} = await fixture(t);
  let calls = 0;
  const fake = provider(async context => {calls++; return answer(context);});
  for (const bad of [
    {conversations: []},
    {conversations: [{...plan().conversations[0], suspectId: 'not-a-public-suspect'}]},
    plan([[2, ['First']], [1, ['Backwards']]]),
    plan([[1, ['a', 'b', 'c', 'd']]]),
    plan([[1, ['q'.repeat(301)]]]),
  ]) {
    assert.throws(() => validateConversationPlan(bad, runtime.caseData), /Invalid/);
    await assert.rejects(run(ledger, {plan: bad, provider: fake}), /Invalid/);
  }
  assert.equal(calls, 0);
  assert.equal((await ledger.snapshot()).entries.length, 0);
});

test('ordinary command invocation requires explicit evaluation configuration', async () => {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('SHIFT_EVAL_') || key === 'SHIFT_LOCAL_AI_KEY_FILE') delete env[key];
  const script = fileURLToPath(new URL('../scripts/evaluate-conversations.mjs', import.meta.url));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {env, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject); child.on('close', code => resolve({code, stdout, stderr}));
  });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Conversation evaluation failed; inspect the ledger before any retry/);
});
