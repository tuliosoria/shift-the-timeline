import test from 'node:test';
import assert from 'node:assert/strict';
import {AiJobs} from '../server/ai/jobs.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {PROPOSED_LIMITS} from '../server/ai/budget.mjs';
import {readAzureConfig} from '../server/azure/config.mjs';
import {runJob} from '../server/ai/worker.mjs';
import {harness,policy,fakeProvider,id} from './helpers/ai.mjs';
const uncapped={uncapped:true,roomMicroUsd:null,dayMicroUsd:null,monthMicroUsd:null};
const env={SHIFT_RUNTIME:'azure',NODE_ENV:'production',SHIFT_ORIGIN:'https://shift.example',SHIFT_PG_HOST:'shift.postgres.database.azure.com',SHIFT_PG_USER:'shift_app',SHIFT_PG_DATABASE:'shift',SHIFT_CASE_FILE:'/private/case.json',SHIFT_CASE_SHA256:'a'.repeat(64),SHIFT_AI_ENABLED:'true',SHIFT_AI_OPERATOR_CONSENT:'true',OPENAI_API_KEY:'synthetic-never-used'};
const config=p=>readAzureConfig({...env,SHIFT_AI_POLICY:JSON.stringify(p)});

test('uncapped mode is explicit null limits, bounded defaults remain unchanged',()=>{
 const bounded={...PROPOSED_LIMITS,...policy};assert.deepEqual(config(bounded).policy,bounded);
 assert.deepEqual(config({...bounded,...uncapped}).policy,{...bounded,...uncapped});
 const jobs=new AiJobs({store:new MemoryStore(),policy});assert.equal(jobs.policy.roomMicroUsd,PROPOSED_LIMITS.roomMicroUsd);assert.equal(jobs.policy.uncapped,undefined);
 for(const patch of [
  {roomMicroUsd:null}, {...uncapped,uncapped:false}, {...uncapped,uncapped:'true'},
  {...uncapped,roomMicroUsd:250000}, {...uncapped,dayMicroUsd:0},
  {...uncapped,monthMicroUsd:undefined}, {...uncapped,maxConcurrent:3},
  {...uncapped,inputTokens:2501}, {...uncapped,outputTokens:351},
  {roomMicroUsd:Number.MAX_SAFE_INTEGER}
 ]){
  assert.throws(()=>new AiJobs({store:new MemoryStore(),policy:{...policy,...patch}}));
  assert.throws(()=>config({...bounded,...patch}),/Invalid Azure/);
 }
});

test('uncapped admission exceeds every prior spending ceiling but retains CAS accounting and idempotency',async()=>{
 const h=await harness(uncapped);await h.ask();const original=h.jobList()[0],used=100_000_000;
 const writes=await Promise.all(original.budgetKeys.map(async key=>{const before=await h.store.getAi(key);return {key,expectedVersion:before.version,value:{...before,version:before.version+1,usedMicroUsd:used}};}));await h.store.commitAi({writes});
 const request=id();await Promise.all([h.ask('session-B',request),h.ask('session-B',request)]);assert.equal(h.jobList().length,2);
 for(const key of original.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,used+3900);
 const next=h.jobList().find(job=>job.id!==original.id);await runJob({enabled:true,repository:h.jobs,jobId:next.id,provider:fakeProvider(),now:h.now});
 for(const key of next.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,used+30);
});

test('uncapped spending does not bypass two-call concurrency or uncertain-call slot retention',async()=>{
 const h=await harness(uncapped);for(const session of ['session-A','session-B','session-C'])await h.ask(session);
 const claims=await Promise.all(h.jobList().map(job=>h.jobs.claim(job.id)));assert.equal(claims.length,3);
 assert.equal(await h.jobs.markProviderStarted(claims[0]),true);assert.equal(await h.jobs.markProviderStarted(claims[1]),true);assert.equal(await h.jobs.markProviderStarted(claims[2]),false);
 await h.jobs.fallback(claims[0],'response_lost',{costUncertain:true});
 assert.equal((await h.store.getAi(`AIJOB#${claims[0].id}`)).settledMicroUsd,3900);
 assert.equal((await h.store.getAi('AISLOTS#GLOBAL')).active.length,2);assert.equal(await h.jobs.markProviderStarted(claims[2]),false);
});

test('uncapped pre-call expiry refunds while uncertain paid attempt retains reservation without duplicate call',async()=>{
 const expired=await harness(uncapped);await expired.ask();const job=expired.jobList()[0];expired.advance(31000);let calls=0;
 const provider=Object.assign(async()=>{calls++;throw new Error('uncertain synthetic failure');},{model:policy.model});
 await runJob({enabled:true,repository:expired.jobs,jobId:job.id,provider,now:expired.now});assert.equal(calls,0);
 for(const key of job.budgetKeys)assert.equal((await expired.store.getAi(key)).usedMicroUsd,0);
 const h=await harness(uncapped);await h.ask();const pending=h.jobList()[0];
 await runJob({enabled:true,repository:h.jobs,jobId:pending.id,provider,now:h.now});await runJob({enabled:true,repository:h.jobs,jobId:pending.id,provider,now:h.now});assert.equal(calls,1);
 for(const key of pending.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,3900);
 assert.equal((await h.store.getAi(`AIJOB#${pending.id}`)).costUncertain,true);
});

test('uncapped mode never bypasses corrupt or unsafe-integer accounting invariants',async()=>{
 const h=await harness(uncapped);await h.ask();const job=h.jobList()[0];
 const balance=await h.store.getAi(job.budgetKeys[0]);await h.store.commitAi({writes:[{key:job.budgetKeys[0],expectedVersion:balance.version,value:{...balance,version:balance.version+1,usedMicroUsd:Number.MAX_SAFE_INTEGER}}]});
 const view=await h.ask('session-B');assert.equal(h.jobList().length,1);assert.equal(view.me.interviews[0].messages[0].narration.status,'fallback');
});

test('uncapped Azure runtime still requires per-question consent before admitting AI',async()=>{
 const {createAzureRuntime}=await import('../server/azure/runtime.mjs');
 const {validateCase}=await import('../server/case-loader.mjs');
 const {TRAIN_CASE,CASES}=await import('./fixtures/case.mjs');
 const store=Object.assign(new MemoryStore(),{checkReady:async()=>true,cleanupExpired:async()=>0});
 const runtime=await createAzureRuntime({env:{...env,SHIFT_ALLOW_NEW_ROOMS:'true',SHIFT_AI_POLICY:JSON.stringify({...PROPOSED_LIMITS,...policy,...uncapped})},store,loadCaseImpl:async()=>validateCase({caseData:TRAIN_CASE,catalog:CASES}),fetchImpl:async()=>{assert.fail('Provider must not run during question admission');}});
 const post=async(path,body,cookie='')=>{const response=await runtime.api(new Request(env.SHIFT_ORIGIN+path,{method:'POST',headers:{origin:env.SHIFT_ORIGIN,'content-type':'application/json',cookie},body:JSON.stringify(body)}));assert.ok(response.status===200||response.status===201);return {body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const sessions=[];for(let i=0;i<3;i++)sessions.push((await post('/api/session',{})).cookie);
  const created=await post('/api/rooms',{name:'A',caseId:'demo',requestId:id()},sessions[0]);const code=created.body.code;
  for(let i=1;i<3;i++)await post(`/api/rooms/${code}/join`,{name:`P${i}`,requestId:id()},sessions[i]);
  await post(`/api/rooms/${code}/actions`,{type:'start',id:id()},sessions[0]);
  await post(`/api/rooms/${code}/actions`,{type:'select',round:1,suspectId:'suspect-1',id:id()},sessions[0]);
  const ask={type:'ask',round:1,question:'A synthetic private question',topic:'clue'};
  await post(`/api/rooms/${code}/actions`,{...ask,id:id()},sessions[0]);assert.equal(store.ai.size,0);
  await post(`/api/rooms/${code}/actions`,{...ask,topic:'alibi',id:id(),aiConsent:true},sessions[0]);assert.equal([...store.ai.values()].filter(value=>value.kind==='job').length,1);
 }finally{await runtime.stop();}
});
