// Deterministic HTTP/worker fixture. No external provider or paid calls.
import {createServer} from '../../server/http.mjs';
import {createApi} from '../../server/api.mjs';
import {DurableGame} from '../../server/persistent-game.mjs';
import {Sessions} from '../../server/sessions.mjs';
import {MemoryStore} from '../../server/storage/memory.mjs';
import {AiJobs} from '../../server/ai/jobs.mjs';
import {runJob} from '../../server/ai/worker.mjs';
import {TRAIN_CASE, CASES} from '../fixtures/case.mjs';

export async function startConversationServer({heldQuestions = []} = {}) {
  const policy = {model:'synthetic-model', inputRate:0.4, outputRate:1.6,
    roomMicroUsd:250000, dayMicroUsd:10000000, monthMicroUsd:50000000, maxConcurrent:8};
  // Holding a synthetic answer must not introduce a wall-clock deadline race.
  const time = Date.now(), now = () => time, store = new MemoryStore();
  const jobs = new AiJobs({store, policy, now});
  const game = new DurableGame({store, caseData:TRAIN_CASE, catalog:CASES, ai:jobs, now});
  const calls = [], gates = new Map(), blocked = new Set(heldQuestions), inFlight = new Map(), failures = [];
  const provider = Object.assign(async context => {
    const input = JSON.parse(context.input);
    calls.push({input, context:structuredClone(context)});
    if (blocked.has(input.question)) await new Promise(resolve => gates.set(input.question, resolve));
    return {reply:`Synthetic testimony: ${input.question}`, unlocked:[], inputTokens:10, outputTokens:5};
  }, {model:policy.model});
  let api;
  const server = createServer({api:(...args) => api(...args), origin:'http://127.0.0.1'});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  api = createApi({game, sessions:new Sessions({store, secure:false, now}), allowedOrigin:origin, rateLimit:async () => {}});
  const timer = setInterval(() => {
    for (const job of store.ai.values()) {
      if (job.kind !== 'job' || job.status !== 'pending' || inFlight.has(job.id)) continue;
      const work = runJob({enabled:true, jobId:job.id, repository:jobs, provider, now})
        .catch(error => failures.push(error.message)).finally(() => inFlight.delete(job.id));
      inFlight.set(job.id, work);
    }
  }, 20);
  const release = question => { blocked.delete(question); gates.get(question)?.(); gates.delete(question); };
  return {origin, game, store, calls, failures, release, async close() {
    clearInterval(timer); for (const question of blocked) release(question);
    await Promise.allSettled([...inFlight.values()]);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }};
}
