import assert from 'node:assert/strict';
import {MemoryStore} from '../../server/storage/memory.mjs';
import {DurableGame} from '../../server/persistent-game.mjs';
import {TRAIN_CASE,CASES} from '../fixtures/case.mjs';
import * as impl from '../../server/ai/jobs.mjs';
let serial=0;
const id=()=>`ai-request-${++serial}-xxxxxxxx`;
const policy={model:'synthetic-model',inputRate:0.4,outputRate:1.6,roomMicroUsd:250000,dayMicroUsd:10000000,monthMicroUsd:50000000,maxConcurrent:8};
// 6000 input × 0.4 + 1024 output × 1.6 microUSD; a fake call of 10/5 tokens settles at 12.
const RESERVE=4039,FAKE_COST=12;
async function harness(overrides={},options={}){
 assert.equal(typeof impl.AiJobs,'function');let time=options.time??Date.UTC(2026,10,10,10);
 const store=options.store??new MemoryStore(),now=()=>time,caseData=options.caseData??TRAIN_CASE;
 const jobs=new impl.AiJobs({store,policy:{...policy,...overrides},now});
 const game=new DurableGame({store,caseData,catalog:CASES,now,ai:jobs});
 const a=await game.create('session-A','A','demo',id());
 await game.join(a.code,'session-B','B',id());await game.join(a.code,'session-C','C',id());
 await game.act(a.code,'session-A',{type:'start',id:id()});
 for(const session of ['session-A','session-B','session-C'])await game.act(a.code,session,{type:'select',round:1,suspectId:'suspect-1',id:id()});
 const ask=(session='session-A',request=id(),question='Uma pergunta privada',round=1)=>game.act(a.code,session,{type:'ask',round,question,id:request});
 const room=()=>store.getRoom(a.code);
 // Seeds a budget balance and its initialization guard exactly as an earlier admission would have.
 const seedBudget=async(key,usedMicroUsd)=>store.commitAi({writes:[
  {key,expectedVersion:null,value:{kind:'budget',usedMicroUsd,expiresAt:time+8*86400000,version:1}},
  {key:`AIBUDGET#GUARD#${key}`,expectedVersion:null,value:{kind:'budget_guard',budgetKey:key,expiresAt:time+9*86400000,version:1}}]});
 return {store,jobs,game,code:a.code,now,advance:ms=>time+=ms,ask,room,seedBudget,jobList:()=>[...store.ai.values()].filter(x=>x.kind==='job')};
}
const fakeProvider=(result={reply:'Uma fala fictícia.',unlocked:[]})=>Object.assign(async()=>({...result,inputTokens:10,outputTokens:5}),{model:'synthetic-model'});


export {harness,id,policy,fakeProvider,RESERVE,FAKE_COST};
