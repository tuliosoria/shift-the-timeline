// A real HTTP server with the in-memory store and an AI that answers after a delay.
// Synthetic only: no provider, network or production content.
import {createServer} from '../../server/http.mjs';
import {createApi} from '../../server/api.mjs';
import {DurableGame} from '../../server/persistent-game.mjs';
import {Sessions} from '../../server/sessions.mjs';
import {MemoryStore} from '../../server/storage/memory.mjs';
import {AiJobs} from '../../server/ai/jobs.mjs';
import {runJob} from '../../server/ai/worker.mjs';
import {TRAIN_CASE, CASES} from '../fixtures/case.mjs';

const policy = {model: 'synthetic-model', inputRate: 0.4, outputRate: 1.6, roomMicroUsd: 250000, dayMicroUsd: 10000000, monthMicroUsd: 50000000, maxConcurrent: 8};

// Replies after `delay` ms and unlocks the first allowed deduction when the question contains "where".
export function fakeProvider({delay = 600} = {}) {
  return Object.assign(async context => {
    await new Promise(r => setTimeout(r, delay));
    const {question} = JSON.parse(context.input);
    return {reply: `A synthetic reply to: ${question}`, unlocked: /where/i.test(question) ? context.allowedIds.slice(0, 1) : [], inputTokens: 10, outputTokens: 5};
  }, {model: policy.model});
}

export async function startFakeAiServer({caseData = TRAIN_CASE, delay = 600} = {}) {
  const store = new MemoryStore(), jobs = new AiJobs({store, policy});
  const game = new DurableGame({store, caseData, catalog: CASES, ai: jobs}), provider = fakeProvider({delay});
  let api;
  const server = createServer({api: (...args) => api(...args), origin: 'http://127.0.0.1'});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  api = createApi({game, sessions: new Sessions({store, secure: false}), allowedOrigin: origin, rateLimit: async () => {}});
  let running = null;
  const timer = setInterval(() => {
    running ??= jobs.reconcile({send: ({jobId}) => runJob({enabled: true, jobId, repository: jobs, provider, rates: policy})}).catch(() => {}).finally(() => { running = null; });
  }, 100);
  return {origin, store, game, async close() {
    clearInterval(timer); await running;
    server.closeAllConnections(); await new Promise(r => server.close(r));
  }};
}
