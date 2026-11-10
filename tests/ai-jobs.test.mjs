import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../server/storage/memory.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
import {runJob} from '../server/ai/worker.mjs';
const impl=await import('../server/ai/jobs.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
import {harness,id,policy,fakeProvider} from './helpers/ai.mjs';
test('question admission atomically reserves budgets and persists private job/outbox once',async()=>{
 const h=await harness(),request=id();await Promise.all([h.ask('session-A',request),h.ask('session-A',request)]);
 assert.equal(h.jobList().length,1);const job=h.jobList()[0];assert.equal(job.reservedMicroUsd,3900);
 for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,3900);
 assert.equal((await h.store.getAi(`AIOUTBOX#${job.id}`)).status,'pending');
 assert.equal((await h.game.view(h.code,'session-A')).me.interviews[0].messages.length,1);
 assert.ok(!JSON.stringify(job.context).includes(TRAIN_CASE.solution.plan));assert.deepEqual(Object.keys(job.context).sort(),['canonical','persona','question']);
 assert.ok(!JSON.stringify(await h.game.view(h.code,'session-B')).includes('Uma pergunta privada'));
});

test('competing questions admit at most the remaining room budget and keep canonical fallback',async()=>{
 const h=await harness({roomMicroUsd:3900});await Promise.all([h.ask('session-A'),h.ask('session-B')]);
 assert.equal(h.jobList().length,1);const messages=await Promise.all(['session-A','session-B'].map(async s=>(await h.game.view(h.code,s)).me.interviews[0].messages[0]));
 assert.deepEqual(messages.map(m=>m.narration.status).sort(),['fallback','pending']);
 assert.ok(messages.every(m=>m.answer===TRAIN_CASE.suspects[1].responses.clue));
});

test('failed question transaction does not leak a job or consume the AI budget',async()=>{
 const h=await harness(),original=h.store.commitRoom.bind(h.store);h.store.commitRoom=async args=>{if(args.aiWrites?.length)throw new Error('Unavailable');return original(args);};
 await assert.rejects(()=>h.ask(),/Unavailable/);assert.equal(h.jobList().length,0);assert.equal(h.store.ai.size,0);
 assert.equal((await h.game.view(h.code,'session-A')).me.interviews[0].messages.length,0);
});

test('durable completion adds only private narration and settles reservation exactly once',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0];let calls=0;const provider=Object.assign(async()=>{calls++;return {text:'Uma fala fictícia.',inputTokens:10,outputTokens:5};},{model:policy.model});
 const a=await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now});assert.equal(a.status,'complete');
 await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now});assert.equal(calls,1);
 const msg=(await h.game.view(h.code,'session-A')).me.interviews[0].messages[0];assert.equal(msg.narration.text,'Uma fala fictícia.');assert.equal(msg.answer,job.context.canonical);
 for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,30);
 await h.game.act(h.code,'session-A',{id:id(),type:'share',messageId:msg.id});const other=await h.game.view(h.code,'session-B');assert.equal(other.board[0].text,msg.answer);assert.ok(!JSON.stringify(other).includes('Uma fala fictícia.'));
});

test('expired claim can be fenced out before provider start but never retried after start',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0],old=await h.jobs.claim(job.id);h.advance(6000);const newer=await h.jobs.claim(job.id);
 assert.notEqual(newer.fence,old.fence);assert.equal(await h.jobs.markProviderStarted(old),false);assert.equal(await h.jobs.markProviderStarted(newer),true);
 h.advance(6000);assert.equal(await h.jobs.claim(job.id),null);
});

test('unknown provider outcome retains the full reservation and cannot trigger a second call',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0];let calls=0;const provider=Object.assign(async()=>{calls++;throw new Error('response lost');},{model:policy.model});
 const result=await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now});assert.equal(result.status,'fallback');
 await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now});assert.equal(calls,1);
 for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,3900);
 assert.equal((await h.store.getAi(`AIJOB#${job.id}`)).costUncertain,true);
});

test('deadline before provider start refunds reservation without a paid call',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0];h.advance(31000);let calls=0;
 await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider:()=>{calls++;},now:h.now});assert.equal(calls,0);
 for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,0);
});

test('late result after host advance never adds narration or changes canonical state',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0];const provider=Object.assign(async()=>{await h.game.act(h.code,'session-A',{id:id(),type:'advance',round:1,confirmed:true});return {text:'Late voice',inputTokens:10,outputTokens:5};},{model:policy.model});
 const result=await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now});assert.equal(result.status,'fallback');
 const view=await h.game.view(h.code,'session-A');assert.equal(view.round,2);assert.ok(!JSON.stringify(view).includes('Late voice'));assert.equal(view.me.interviews[0].messages[0].answer,job.context.canonical);
});

test('durable slots allow only two provider starts and mismatched model never starts',async()=>{
 const h=await harness();await Promise.all(['session-A','session-B','session-C'].map(s=>h.ask(s)));const jobs=h.jobList();const claims=await Promise.all(jobs.map(j=>h.jobs.claim(j.id)));
 const starts=await Promise.all(claims.map(j=>h.jobs.markProviderStarted(j)));assert.equal(starts.filter(Boolean).length,2);
 const other=await harness();await other.ask();let calls=0;const provider=Object.assign(async()=>{calls++;},{model:'wrong-model'});
 await runJob({enabled:true,repository:other.jobs,jobId:other.jobList()[0].id,provider,now:other.now});assert.equal(calls,0);
});

test('missing or corrupt budget state blocks settlement instead of manufacturing a refund',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0],claim=await h.jobs.claim(job.id);assert.equal(await h.jobs.markProviderStarted(claim),true);
 h.store.ai.delete(job.budgetKeys[0]);await assert.rejects(()=>h.jobs.complete(claim,{voice:'Text',actualMicroUsd:30}),/budget/i);
 assert.equal((await h.store.getAi(`AIJOB#${job.id}`)).status,'provider_started');
});

test('competing rooms cannot exceed a shared daily budget',async()=>{const a=await harness({dayMicroUsd:3900}),b=await harness({dayMicroUsd:3900},{store:a.store});await Promise.all([a.ask(),b.ask()]);assert.equal(a.jobList().length,1);});
test('settlement across UTC day and month boundary credits the original buckets only',async()=>{const h=await harness({}, {time:Date.UTC(2026,10,30,23,59,59)});await h.ask();const original=h.jobList()[0];h.advance(2000);await h.ask('session-B');const next=h.jobList().find(j=>j.id!==original.id);assert.notEqual(original.budgetKeys[1],next.budgetKeys[1]);assert.notEqual(original.budgetKeys[2],next.budgetKeys[2]);await runJob({enabled:true,repository:h.jobs,jobId:original.id,provider:fakeProvider(),now:h.now});assert.equal((await h.store.getAi(original.budgetKeys[1])).usedMicroUsd,30);assert.equal((await h.store.getAi(next.budgetKeys[1])).usedMicroUsd,3900);});
test('lost completion acknowledgement is idempotent and never refunds a completed charge twice',async()=>{const h=await harness();await h.ask();const job=h.jobList()[0],commit=h.store.commitAi.bind(h.store);let lost=false;h.store.commitAi=async args=>{await commit(args);if(!lost&&args.writes.some(w=>w.value.kind==='job'&&w.value.status==='complete')){lost=true;throw new Error('response lost');}};const result=await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider:fakeProvider(),now:h.now});assert.equal(result.status,'complete');for(const k of job.budgetKeys)assert.equal((await h.store.getAi(k)).usedMicroUsd,30);});
test('unavailable budget lookup preserves a canonical question without scheduling AI',async()=>{const h=await harness();h.store.getAi=async()=>{throw new Error('budget read failed');};await h.ask();assert.equal(h.jobList().length,0);const msg=(await h.game.view(h.code,'session-A')).me.interviews[0].messages[0];assert.equal(msg.narration.status,'fallback');assert.equal(msg.answer,TRAIN_CASE.suspects[1].responses.clue);});
for(const corruption of ['missing','invalid'])test(`provider start fails closed on ${corruption} budget before a call`,async()=>{const h=await harness();await h.ask();const job=h.jobList()[0];if(corruption==='missing')h.store.ai.delete(job.budgetKeys[0]);else h.store.ai.get(job.budgetKeys[0]).usedMicroUsd=NaN;let calls=0;const provider=Object.assign(async()=>{calls++;return {text:'Voice',inputTokens:10,outputTokens:5};},{model:policy.model});await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now}).catch(()=>{});assert.equal(calls,0);assert.notEqual((await h.store.getAi(`AIJOB#${job.id}`)).status,'provider_started');});
test('a lost previously initialized budget is never reset to zero by a new admission',async()=>{const h=await harness({dayMicroUsd:3900});await h.ask();const job=h.jobList()[0];await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider:Object.assign(async()=>({text:'Voice',inputTokens:2500,outputTokens:350}),{model:policy.model}),now:h.now});h.store.ai.delete(job.budgetKeys[1]);await h.ask('session-B');assert.equal(h.jobList().length,1);assert.equal((await h.game.view(h.code,'session-B')).me.interviews[0].messages[0].narration.status,'fallback');});
test('time spent reading room data cannot authorize provider start after deadline',async()=>{const h=await harness();await h.ask();const job=h.jobList()[0],get=h.store.getRoom.bind(h.store);let delay=true,calls=0;h.store.getRoom=async code=>{const room=await get(code);if(delay){delay=false;h.advance(31000);}return room;};const provider=Object.assign(async()=>{calls++;return {text:'Voice',inputTokens:10,outputTokens:5};},{model:policy.model});await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now});assert.equal(calls,0);});
test('time spent confirming the start marker cannot outlive the claim before calling provider',async()=>{const h=await harness();await h.ask();const job=h.jobList()[0],commit=h.store.commitAi.bind(h.store);let calls=0;h.store.commitAi=async args=>{await commit(args);if(args.writes.some(w=>w.value.kind==='job'&&w.value.status==='provider_started'))h.advance(6000);};const provider=Object.assign(async()=>{calls++;return {text:'Voice',inputTokens:10,outputTokens:5};},{model:policy.model});await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now});assert.equal(calls,0);});
test('provider preparation carries the deadline through delayed secret retrieval to HTTP start',async()=>{const {createProvider}=await import('../server/ai/provider.mjs');const h=await harness();await h.ask();const job=h.jobList()[0];let calls=0;const provider=createProvider({model:policy.model,getSecret:async()=>{h.advance(31000);return 'synthetic-key-not-real';},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'{"voice":"Text"}'}]}],usage:{input_tokens:10,output_tokens:5}}));}});await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now});assert.equal(calls,0);});
