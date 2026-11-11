import assert from 'node:assert/strict';
import {MemoryStore} from '../../server/storage/memory.mjs';
import {DurableGame} from '../../server/persistent-game.mjs';
import {TRAIN_CASE,CASES} from '../fixtures/case.mjs';
import * as impl from '../../server/ai/jobs.mjs';
let serial=0;
const id=()=>`ai-request-${++serial}-xxxxxxxx`;
const policy={model:'synthetic-model',inputRate:0.4,outputRate:1.6,roomMicroUsd:250000,dayMicroUsd:10000000,monthMicroUsd:50000000,maxConcurrent:8};
async function harness(overrides={},options={}){
 assert.equal(typeof impl.AiJobs,'function');let time=options.time??Date.UTC(2026,10,10,10);
 const store=options.store??new MemoryStore(),now=()=>time;
 const jobs=new impl.AiJobs({store,policy:{...policy,...overrides},now});
 const game=new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES,now,ai:jobs});
 const a=await game.create('session-A','A','demo',id());
 await game.join(a.code,'session-B','B',id());await game.join(a.code,'session-C','C',id());
 await game.act(a.code,'session-A',{type:'start',id:id()});
 for(const session of ['session-A','session-B','session-C'])await game.act(a.code,session,{type:'select',round:1,suspectId:'suspect-1',id:id()});
 const ask=(session='session-A',request=id())=>game.act(a.code,session,{type:'ask',round:1,question:'Uma pergunta privada',topic:'clue',id:request});
 return {store,jobs,game,code:a.code,now,advance:ms=>time+=ms,ask,jobList:()=>[...store.ai.values()].filter(x=>x.kind==='job')};
}
const fakeProvider=()=>Object.assign(async()=>({text:'Uma fala fictícia.',inputTokens:10,outputTokens:5}),{model:'synthetic-model'});


export {harness,id,policy,fakeProvider};
