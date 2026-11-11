import test from 'node:test';
import assert from 'node:assert/strict';
import {TRAIN_CASE} from './fixtures/case.mjs';
import {runJob} from '../server/ai/worker.mjs';
import {harness,id,policy,fakeProvider,RESERVE,FAKE_COST} from './helpers/ai.mjs';
const ALIBI='Where were you at the time?',SUSPECT=TRAIN_CASE.suspects[1];
const mine=async(h,session='session-A',round=1,index=0)=>(await h.game.view(h.code,session)).me.interviews.find(i=>i.round===round).messages[index];
const run=(h,jobId,provider=fakeProvider())=>runJob({enabled:true,repository:h.jobs,jobId,provider,now:h.now});
const pendingJob=h=>h.jobList().find(j=>j.status==='pending');
const counted=(result,calls)=>Object.assign(async()=>{calls.n++;return {...result,inputTokens:10,outputTokens:5};},{model:policy.model});

test('question admission atomically reserves budgets and persists private job/outbox once',async()=>{
 const h=await harness(),request=id();await Promise.all([h.ask('session-A',request),h.ask('session-A',request)]);
 assert.equal(h.jobList().length,1);const job=h.jobList()[0];assert.equal(job.reservedMicroUsd,RESERVE);
 for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,RESERVE);
 assert.equal((await h.store.getAi(`AIOUTBOX#${job.id}`)).status,'pending');
 const view=await h.game.view(h.code,'session-A');assert.equal(view.me.interviews[0].messages.length,1);
 assert.deepEqual(view.me.interviews[0].messages[0],{id:job.messageId,question:'Uma pergunta privada',status:'pending',reply:null,unlocked:[]});
 assert.deepEqual(Object.keys(job.context).sort(),['allowedIds','input','instructions']);assert.deepEqual(job.context.allowedIds,['d-alibi-gap']);
 assert.equal(job.suspectId,'suspect-1');assert.equal(job.round,1);assert.equal(JSON.parse(job.context.input).question,'Uma pergunta privada');
 assert.ok(!JSON.stringify(job).includes(TRAIN_CASE.solution.plan));assert.ok(!JSON.stringify(job).includes(TRAIN_CASE.suspects[2].brief));
 assert.equal((await h.room()).players[0].interviews[0].messages[0].narration,undefined);
 assert.ok(!JSON.stringify(await h.game.view(h.code,'session-B')).includes('Uma pergunta privada'));
});

test('chat context carries this interview\'s earlier resolved exchanges',async()=>{
 const h=await harness();await h.ask('session-A',id(),'First question');await run(h,pendingJob(h).id,fakeProvider({reply:'First reply',unlocked:[]}));
 await h.ask('session-A',id(),'Second question');const input=JSON.parse(pendingJob(h).context.input);
 assert.deepEqual(input.history,[{question:'First question',reply:'First reply'}]);assert.equal(input.question,'Second question');
});

test('pending question resolves with ai reply and unlocks',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0],calls={n:0},before=(await h.room()).version;
 const provider=counted({reply:'R',unlocked:['d-alibi-gap','d-motive-debt','not-a-deduction']},calls);
 assert.equal((await run(h,job.id,provider)).status,'complete');await run(h,job.id,provider);assert.equal(calls.n,1);
 const view=await h.game.view(h.code,'session-A');
 assert.deepEqual(view.me.interviews[0].messages[0],{id:job.messageId,question:'Uma pergunta privada',status:'complete',reply:'R',unlocked:['d-alibi-gap']});
 assert.deepEqual(view.me.deductions.map(d=>d.id),['d-alibi-gap']);assert.equal(view.version,before+1);
 for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,FAKE_COST);
 assert.deepEqual((await h.game.view(h.code,'session-B')).me.deductions,[]);
});

test('provider failure resolves canonically with source unlocks',async()=>{
 const h=await harness();await h.ask('session-A',id(),ALIBI);const job=h.jobList()[0];let calls=0;
 const provider=Object.assign(async()=>{calls++;throw new Error('response lost');},{model:policy.model});
 assert.equal((await run(h,job.id,provider)).status,'fallback');await run(h,job.id,provider);assert.equal(calls,1);
 const message=await mine(h);assert.equal(message.status,'canonical');assert.equal(message.reply,SUSPECT.responses.alibi);assert.deepEqual(message.unlocked,['d-alibi-gap']);
 assert.deepEqual((await h.game.view(h.code,'session-A')).me.deductions.map(d=>d.id),['d-alibi-gap']);
 for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,RESERVE);
 assert.equal((await h.store.getAi(`AIJOB#${job.id}`)).costUncertain,true);
});

test('budget refusal resolves canonically at ask time',async()=>{
 const h=await harness(),key=`AIBUDGET#ROOM#${h.code}`;await h.seedBudget(key,policy.roomMicroUsd-RESERVE+1);
 const view=await h.ask('session-A',id(),ALIBI),message=view.me.interviews[0].messages[0];
 assert.equal(message.status,'canonical');assert.equal(message.reply,SUSPECT.responses.alibi);assert.deepEqual(message.unlocked,['d-alibi-gap']);
 assert.deepEqual(view.me.deductions.map(d=>d.id),['d-alibi-gap']);
 assert.equal(h.jobList().length,0);assert.equal(h.store.ai.size,2);assert.equal((await h.store.getAi(key)).usedMicroUsd,policy.roomMicroUsd-RESERVE+1);
});

test('competing questions admit at most the remaining room budget and resolve the other canonically',async()=>{
 const h=await harness();await h.seedBudget(`AIBUDGET#ROOM#${h.code}`,policy.roomMicroUsd-RESERVE);await Promise.all([h.ask('session-A'),h.ask('session-B')]);
 assert.equal(h.jobList().length,1);const messages=await Promise.all(['session-A','session-B'].map(s=>mine(h,s)));
 assert.deepEqual(messages.map(m=>m.status).sort(),['canonical','pending']);
 assert.equal(messages.find(m=>m.status==='canonical').reply,SUSPECT.responses.clue);
 assert.equal((await h.store.getAi(`AIBUDGET#ROOM#${h.code}`)).usedMicroUsd,policy.roomMicroUsd);
});

test('concurrent asks on one interview never create two jobs or double-reserve budget',async()=>{
 const h=await harness();const results=await Promise.allSettled([h.ask('session-A'),h.ask('session-A')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected').reason;assert.equal(rejected.status,409);
 assert.match(rejected.message,/Wait for the answer before asking again\.|Too many simultaneous actions/);
 assert.equal(h.jobList().length,1);for(const key of h.jobList()[0].budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,RESERVE);
 assert.equal((await h.game.view(h.code,'session-A')).me.interviews[0].messages.length,1);
});

test('consent field no longer exists',async()=>{
 const h=await harness();
 await assert.rejects(()=>h.game.act(h.code,'session-A',{type:'ask',round:1,question:'Q?',aiConsent:true,id:id()}),e=>e.status===400&&e.message==='Unexpected question field.');
 assert.equal(h.store.ai.size,0);
});

test('chat context that is too large for the job record resolves canonically at ask time',async()=>{
 for(const size of [15500,21000]){
  const caseData={...TRAIN_CASE,suspects:TRAIN_CASE.suspects.map(s=>s.id==='suspect-1'?{...s,brief:'x'.repeat(size)}:s)};
  const h=await harness({},{caseData});const message=(await h.ask('session-A',id(),ALIBI)).me.interviews[0].messages[0];
  assert.equal(message.status,'canonical',`brief ${size}`);assert.deepEqual(message.unlocked,['d-alibi-gap']);assert.equal(h.store.ai.size,0);
 }
});

test('failed question transaction does not leak a job or consume the AI budget',async()=>{
 const h=await harness(),original=h.store.commitRoom.bind(h.store);h.store.commitRoom=async args=>{if(args.aiWrites?.length)throw new Error('Unavailable');return original(args);};
 await assert.rejects(()=>h.ask(),/Unavailable/);assert.equal(h.jobList().length,0);assert.equal(h.store.ai.size,0);
 assert.equal((await h.game.view(h.code,'session-A')).me.interviews[0].messages.length,0);
});

test('reply that lands after the turn advanced is still applied',async()=>{
 const h=await harness();
 for(let n=0;n<2;n++){await h.ask();await run(h,pendingJob(h).id);}
 await h.ask('session-A',id(),'Third question');const job=pendingJob(h);
 assert.equal((await h.room()).players[0].interviews[0].closed,true);
 await h.game.act(h.code,'session-A',{type:'advance',round:1,confirmed:true,id:id()});
 assert.equal((await run(h,job.id,fakeProvider({reply:'Late but kept',unlocked:['d-alibi-gap']}))).status,'complete');
 const view=await h.game.view(h.code,'session-A');assert.equal(view.round,2);
 const message=view.me.interviews.find(i=>i.round===1).messages[2];assert.equal(message.status,'complete');assert.equal(message.reply,'Late but kept');
 assert.deepEqual(view.me.deductions.map(d=>[d.id,d.round]),[['d-alibi-gap',1]]);
});

test('expired claim can be fenced out before provider start but never retried after start',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0],old=await h.jobs.claim(job.id);h.advance(6000);const newer=await h.jobs.claim(job.id);
 assert.notEqual(newer.fence,old.fence);assert.equal(await h.jobs.markProviderStarted(old),false);assert.equal(await h.jobs.markProviderStarted(newer),true);
 h.advance(6000);assert.equal(await h.jobs.claim(job.id),null);
});

test('deadline before provider start refunds reservation without a paid call and resolves canonically',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0];h.advance(31000);let calls=0;
 await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider:()=>{calls++;},now:h.now});assert.equal(calls,0);
 for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,0);
 assert.equal((await mine(h)).status,'canonical');
});

test('durable slots cap provider starts and mismatched model never starts',async()=>{
 const h=await harness({maxConcurrent:2});await Promise.all(['session-A','session-B','session-C'].map(s=>h.ask(s)));const jobs=h.jobList();const claims=await Promise.all(jobs.map(j=>h.jobs.claim(j.id)));
 const starts=await Promise.all(claims.map(j=>h.jobs.markProviderStarted(j)));assert.equal(starts.filter(Boolean).length,2);
 const other=await harness();await other.ask();let calls=0;const provider=Object.assign(async()=>{calls++;},{model:'wrong-model'});
 await runJob({enabled:true,repository:other.jobs,jobId:other.jobList()[0].id,provider,now:other.now});assert.equal(calls,0);
 assert.equal((await mine(other)).status,'canonical');
});

test('missing or corrupt budget state blocks settlement instead of manufacturing a refund',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0],claim=await h.jobs.claim(job.id);assert.equal(await h.jobs.markProviderStarted(claim),true);
 h.store.ai.delete(job.budgetKeys[0]);await assert.rejects(()=>h.jobs.complete(claim,{reply:'Text',unlocked:[],actualMicroUsd:FAKE_COST}),/budget/i);
 assert.equal((await h.store.getAi(`AIJOB#${job.id}`)).status,'provider_started');assert.equal((await mine(h)).status,'pending');
});

test('completion rejects malformed provider results',async()=>{
 const h=await harness();await h.ask();const job=h.jobList()[0],claim=await h.jobs.claim(job.id);assert.equal(await h.jobs.markProviderStarted(claim),true);
 for(const bad of [{reply:'',unlocked:[]},{reply:'é'.repeat(601),unlocked:[]},{reply:'Fine',unlocked:'d-alibi-gap'},{reply:'Fine',unlocked:[1]},{reply:'Fine',unlocked:['a','b','c','d']},{reply:'Fine',unlocked:[],actualMicroUsd:-1}])
  await assert.rejects(()=>h.jobs.complete(claim,{actualMicroUsd:FAKE_COST,...bad}),/Invalid provider completion/);
 assert.equal((await mine(h)).status,'pending');
});

test('competing rooms cannot exceed a shared daily budget',async()=>{const a=await harness({dayMicroUsd:RESERVE}),b=await harness({dayMicroUsd:RESERVE},{store:a.store});await Promise.all([a.ask(),b.ask()]);assert.equal(a.jobList().length,1);});
test('settlement across UTC day and month boundary credits the original buckets only',async()=>{const h=await harness({}, {time:Date.UTC(2026,10,30,23,59,59)});await h.ask();const original=h.jobList()[0];h.advance(2000);await h.ask('session-B');const next=h.jobList().find(j=>j.id!==original.id);assert.notEqual(original.budgetKeys[1],next.budgetKeys[1]);assert.notEqual(original.budgetKeys[2],next.budgetKeys[2]);await run(h,original.id);assert.equal((await h.store.getAi(original.budgetKeys[1])).usedMicroUsd,FAKE_COST);assert.equal((await h.store.getAi(next.budgetKeys[1])).usedMicroUsd,RESERVE);});
test('lost completion acknowledgement is idempotent and never refunds a completed charge twice',async()=>{const h=await harness();await h.ask();const job=h.jobList()[0],commit=h.store.commitAi.bind(h.store);let lost=false;h.store.commitAi=async args=>{await commit(args);if(!lost&&args.writes.some(w=>w.value.kind==='job'&&w.value.status==='complete')){lost=true;throw new Error('response lost');}};const result=await run(h,job.id);assert.equal(result.status,'complete');for(const k of job.budgetKeys)assert.equal((await h.store.getAi(k)).usedMicroUsd,FAKE_COST);assert.equal((await mine(h)).status,'complete');});
test('unavailable budget lookup resolves the question canonically without scheduling AI',async()=>{const h=await harness();h.store.getAi=async()=>{throw new Error('budget read failed');};await h.ask();assert.equal(h.jobList().length,0);const msg=await mine(h);assert.equal(msg.status,'canonical');assert.equal(msg.reply,SUSPECT.responses.clue);});
for(const corruption of ['missing','invalid'])test(`provider start fails closed on ${corruption} budget before a call`,async()=>{const h=await harness();await h.ask();const job=h.jobList()[0];if(corruption==='missing')h.store.ai.delete(job.budgetKeys[0]);else h.store.ai.get(job.budgetKeys[0]).usedMicroUsd=NaN;const calls={n:0};await run(h,job.id,counted({reply:'Voice',unlocked:[]},calls)).catch(()=>{});assert.equal(calls.n,0);assert.notEqual((await h.store.getAi(`AIJOB#${job.id}`)).status,'provider_started');});
test('a lost previously initialized budget is never reset to zero by a new admission',async()=>{const h=await harness({dayMicroUsd:RESERVE});await h.ask();const job=h.jobList()[0];await run(h,job.id,Object.assign(async()=>({reply:'Voice',unlocked:[],inputTokens:2500,outputTokens:350}),{model:policy.model}));h.store.ai.delete(job.budgetKeys[1]);await h.ask('session-B');assert.equal(h.jobList().length,1);assert.equal((await mine(h,'session-B')).status,'canonical');});
test('time spent reading room data cannot authorize provider start after deadline',async()=>{const h=await harness();await h.ask();const job=h.jobList()[0],get=h.store.getRoom.bind(h.store);let delay=true;h.store.getRoom=async code=>{const room=await get(code);if(delay){delay=false;h.advance(31000);}return room;};const calls={n:0};await run(h,job.id,counted({reply:'Voice',unlocked:[]},calls));assert.equal(calls.n,0);});
test('time spent confirming the start marker cannot outlive the claim before calling provider',async()=>{const h=await harness();await h.ask();const job=h.jobList()[0],commit=h.store.commitAi.bind(h.store);h.store.commitAi=async args=>{await commit(args);if(args.writes.some(w=>w.value.kind==='job'&&w.value.status==='provider_started'))h.advance(6000);};const calls={n:0};await run(h,job.id,counted({reply:'Voice',unlocked:[]},calls));assert.equal(calls.n,0);assert.equal((await mine(h)).status,'canonical');});
test('provider preparation carries the deadline through delayed secret retrieval to HTTP start',async()=>{const {createProvider}=await import('../server/ai/provider.mjs');const h=await harness();await h.ask();const job=h.jobList()[0];let calls=0;const provider=createProvider({model:policy.model,getSecret:async()=>{h.advance(31000);return 'synthetic-key-not-real';},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'{"reply":"Text","unlocked":[]}'}]}],usage:{input_tokens:10,output_tokens:5}}));}});await run(h,job.id,provider);assert.equal(calls,0);assert.equal((await mine(h)).status,'canonical');});
