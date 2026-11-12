// Explicitly invoked, paid multi-visit evaluation. Never imported by production or run by CI.
// All requests use the selected revision's real game admission, context fitting and settlement.
import {randomUUID, createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {openLedger} from './evaluation-ledger.mjs';
import {createLocalSecretReader} from '../server/ai/local-secret.mjs';

// Campaign-only reserve: a 20,000-byte context ceiling does not prove a 6,000-token ceiling.
// This extra headroom covers uncertain evaluation calls without changing production policy.
// Verified successes settle to actual usage; unknown failures retain the entire reservation.
export const EVALUATION_RESERVE_MICROUSD = 5_000;

export async function loadRuntime(root) {
  const load = file => import(pathToFileURL(path.join(root, file)).href);
  const [{DurableGame}, {MemoryStore}, {AiJobs}, {runJob}, {createProvider}, budget, demo] = await Promise.all([
    load('server/persistent-game.mjs'), load('server/storage/memory.mjs'), load('server/ai/jobs.mjs'),
    load('server/ai/worker.mjs'), load('server/ai/provider.mjs'), load('server/ai/budget.mjs'), load('examples/public-demo.mjs'),
  ]);
  const sourceHashes = {};
  for (const file of ['server/ai/chat-context.mjs', 'server/ai/jobs.mjs', 'server/ai/conversation-history.mjs', 'server/ai/provider.mjs', 'server/ai/budget.mjs', 'examples/public-demo.mjs']) {
    try { sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; sourceHashes[file] = null; }
  }
  return {DurableGame, MemoryStore, AiJobs, runJob, createProvider, sourceHashes, ...budget, ...demo};
}

export function validateConversationPlan(plan, caseData) {
  if (!Array.isArray(plan?.conversations) || !plan.conversations.length || plan.conversations.length > 64) throw new Error('Invalid conversation plan');
  const seen = new Set();
  for (const conversation of plan.conversations) {
    if (typeof conversation.id !== 'string' || seen.has(conversation.id) || !caseData.suspects.some(s => s.id === conversation.suspectId)) throw new Error('Invalid conversation');
    seen.add(conversation.id);
    if (!Array.isArray(conversation.visits) || !conversation.visits.length || conversation.visits.length > 4) throw new Error('Invalid visits');
    let round = 0;
    const questionIds = new Set();
    for (const visit of conversation.visits) {
      if (!Number.isInteger(visit.round) || visit.round <= round || visit.round > 4 || !Array.isArray(visit.questions) || !visit.questions.length || visit.questions.length > 3) throw new Error('Invalid visit');
      round = visit.round;
      for (const q of visit.questions) {
        if (typeof q.id !== 'string' || questionIds.has(q.id) || typeof q.question !== 'string' || !q.question.trim() || q.question.length > 300) throw new Error('Invalid question');
        questionIds.add(q.id);
      }
    }
  }
  return plan;
}

export async function runConversationEvaluation({runtime, plan, provider, ledger, runId, variant, sourceRevision, rates, onResult = async () => {}}) {
  validateConversationPlan(plan, runtime.caseData);
  const policy = {...runtime.PROPOSED_LIMITS, ...rates, model: provider.model};
  const reservation = Math.max(EVALUATION_RESERVE_MICROUSD, runtime.reserveCost(policy)), results = [];
  let failures = 0;
  for (const conversation of plan.conversations) {
    const store = new runtime.MemoryStore();
    const jobs = new runtime.AiJobs({store, policy});
    const game = new runtime.DurableGame({store, ai: jobs, caseData: runtime.caseData, catalog: runtime.catalog});
    const host = `eval-${randomUUID()}`, peer = `eval-${randomUUID()}`;
    const {code} = await game.create(host, 'Evaluator', runtime.caseData.id, randomUUID());
    await game.join(code, peer, 'Peer', randomUUID());
    await game.join(code, `eval-${randomUUID()}`, 'Observer', randomUUID());
    const act = action => game.act(code, host, {id: randomUUID(), ...action});
    await act({type: 'start'});
    for (const visit of conversation.visits) {
      while ((await game.view(code, host)).round < visit.round) {
        const round = (await game.view(code, host)).round;
        await act({type: 'advance', round, confirmed: true});
      }
      await act({type: 'select', round: visit.round, suspectId: conversation.suspectId});
      for (const question of visit.questions) {
        // A fresh id is mandatory; rerunning a plan cannot reuse a paid request silently.
        const chargeId = `${runId}:${variant}:${conversation.id}:${question.id}`;
        await act({type: 'ask', round: visit.round, question: question.question});
        const job = [...store.ai.values()].find(j => j.kind === 'job' && j.status === 'pending');
        const row = {scenarioId: conversation.id, suspectId: conversation.suspectId, round: visit.round, questionId: question.id, question: question.question,
          status: null, reply: null, unlocked: [], attempted: false, inputTokens: null, outputTokens: null, costMicroUsd: 0, latencyMs: null};
        let reservationError;
        if (job) {
          const context = JSON.parse(job.context.input);
          row.history = context.history;
          row.contextSha256 = createHash('sha256').update(JSON.stringify(job.context)).digest('hex');
          row.contextBytes = Buffer.byteLength(job.context.instructions + job.context.input);
          const measured = Object.assign(async (context, options) => {
            // If reserving fails, runJob may fall back, but the harness must stop afterwards.
            try { await ledger.reserve(chargeId, reservation, {runId, variant, scenarioId: conversation.id, questionId: question.id, model: provider.model, sourceRevision}); }
            catch (error) { reservationError = error; throw error; }
            row.attempted = true;
            row.costMicroUsd = reservation;
            const start = Date.now();
            try {
              const reply = await provider(context, options);
              const cost = runtime.reserveCost({...rates, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens});
              await ledger.settle(chargeId, cost, {inputTokens: reply.inputTokens, outputTokens: reply.outputTokens});
              Object.assign(row, {inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, costMicroUsd: cost, providerUnlocked: reply.unlocked});
              return reply;
            } catch (error) {
              // No retries: a timeout, rejected output or uncertain settlement retains the reservation.
              await ledger.markUncertain(chargeId, {reason: 'uncertain'});
              throw error;
            } finally { row.latencyMs = Date.now() - start; }
          }, {model: provider.model});
          await runtime.runJob({enabled: true, jobId: job.id, repository: jobs, provider: measured});
        }
        if (reservationError) throw new Error('Campaign ledger refused request; no paid call was made');
        const state = await game.view(code, host), message = state.me.interviews.find(i => i.round === visit.round).messages.at(-1);
        Object.assign(row, {status: message.status, reply: message.reply, unlocked: message.unlocked});
        // Exercise public projection: peers may never see this private testimony.
        const peerState = await game.view(code, peer);
        if (peerState.me.interviews.length || peerState.me.deductions.length) throw new Error('Evaluation privacy invariant failed');
        results.push(row);
        await onResult(row, results);
        failures = row.status === 'complete' ? 0 : failures + 1;
        if (failures >= 3) return {results, stopped: 'three_consecutive_fallbacks'};
      }
    }
  }
  return {results, stopped: null};
}

async function main() {
  const required = ['SHIFT_EVAL_LEDGER','SHIFT_EVAL_PLAN','SHIFT_EVAL_ROOT','SHIFT_EVAL_RUN_ID','SHIFT_EVAL_VARIANT','SHIFT_EVAL_REVISION','SHIFT_EVAL_OUTPUT','SHIFT_LOCAL_AI_KEY_FILE'];
  if (required.some(key => !process.env[key])) throw new Error('Explicit evaluation configuration is required');
  // Fixed campaign policy; changing these values requires a newly reviewed evaluation.
  const rates = {inputRate: 0.10, outputRate: 0.50};
  const ledger = await openLedger(path.resolve(process.env.SHIFT_EVAL_LEDGER), {capMicroUsd: 4500000, rates});
  const runtime = await loadRuntime(path.resolve(process.env.SHIFT_EVAL_ROOT));
  const plan = JSON.parse(await readFile(process.env.SHIFT_EVAL_PLAN, 'utf8'));
  const provider = runtime.createProvider({model: 'gpt-6-luna', getSecret: createLocalSecretReader(process.env.SHIFT_LOCAL_AI_KEY_FILE)});
  const output = path.resolve(process.env.SHIFT_EVAL_OUTPUT);
  await mkdir(path.dirname(output), {recursive: true});
  const metadata = {runId: process.env.SHIFT_EVAL_RUN_ID, variant: process.env.SHIFT_EVAL_VARIANT, sourceRevision: process.env.SHIFT_EVAL_REVISION, rates, sourceHashes: runtime.sourceHashes};
  const run = await runConversationEvaluation({runtime, plan, provider, ledger, ...metadata, onResult: async (_row, results) => {
    await writeFile(output, JSON.stringify({...metadata, results}, null, 2), {encoding: 'utf8', mode: 0o600});
  }});
  await writeFile(output, JSON.stringify({...metadata, ...run, ledger: await ledger.snapshot()}, null, 2), {encoding: 'utf8', mode: 0o600});
  console.log(JSON.stringify({questions: run.results.length, completed: run.results.filter(r => r.status === 'complete').length, stopped: run.stopped, costMicroUsd: run.results.reduce((sum, r) => sum + r.costMicroUsd, 0)}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(() => {console.error('Conversation evaluation failed; inspect the ledger before any retry.'); process.exitCode = 1;});
