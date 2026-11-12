import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalAiConfig,createLocalAi} from '../server/ai/local.mjs';
import {createLocalAiRuntime} from '../server/local-ai.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
const env={SHIFT_LOCAL_AI_ENABLED:'true',SHIFT_LOCAL_AI_CONSENT:'true',SHIFT_ORIGIN:'http://127.0.0.1:3000',SHIFT_LOCAL_AI_MODEL:'synthetic-model',SHIFT_LOCAL_AI_INPUT_RATE:'0.4',SHIFT_LOCAL_AI_OUTPUT_RATE:'1.6',SHIFT_LOCAL_AI_MAX_CALLS:'2',SHIFT_LOCAL_AI_MAX_RESERVE_MICROUSD:'10000'};
const response=()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({reply:'A fictional voice.',unlocked:[]})}]}],usage:{input_tokens:10,output_tokens:5}}));
let serial=0;const id=()=>`local-request-${++serial}-xxxxxxxx`;
async function setup(overrides={},fetchImpl=async()=>response()){
 const store=new MemoryStore();let secrets=0;
 const worker=createLocalAi({env:{...env,...overrides},store,getSecret:async()=>{secrets++;return 'synthetic-test-only';},fetchImpl});
 const game=new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES,ai:worker.admission});
 const {code}=await game.create('a','A','demo',id());await game.join(code,'b','B',id());await game.join(code,'c','C',id());
 await game.act(code,'a',{type:'start',id:id()});
 for(const player of ['a','b','c'])await game.act(code,player,{type:'select',suspectId:'suspect-1',round:1,id:id()});
 const ask=(player='a',request=id())=>game.act(code,player,{type:'ask',question:'What did you notice?',round:1,id:request});
 return {worker,store,game,code,ask,secrets:()=>secrets};
}
test('local AI configuration is explicit, loopback only, priced and bounded',()=>{
 assert.equal(readLocalAiConfig(env).reservation,4039);assert.equal(readLocalAiConfig(env).policy.roomMicroUsd,250000);
 for(const key of Object.keys(env))assert.throws(()=>readLocalAiConfig({...env,[key]:undefined}));
 for(const origin of ['https://127.0.0.1:3000','http://example.com','http://0.0.0.0','http://user@localhost','http://localhost/path','http://localhost?x=1'])assert.throws(()=>readLocalAiConfig({...env,SHIFT_ORIGIN:origin}));
 for(const key of ['SHIFT_TABLE','SHIFT_CASE_BUCKET','SHIFT_CASE_KEY','SHIFT_CASE_SHA256','SHIFT_ORIGIN_SECRET_ARN','AWS_LAMBDA_FUNCTION_NAME'])assert.throws(()=>readLocalAiConfig({...env,[key]:'set'}));
 assert.throws(()=>readLocalAiConfig({...env,NODE_ENV:'production'}));
 // 6000×1 + 1024×4 = 10096 microUSD per question cannot fit 48 questions in a 250000 room budget.
 for(const [key,values] of Object.entries({SHIFT_LOCAL_AI_MAX_CALLS:['13','1.5','0'],SHIFT_LOCAL_AI_MAX_RESERVE_MICROUSD:['250001','1'],SHIFT_LOCAL_AI_INPUT_RATE:['','NaN','-1','Infinity','1']}))for(const value of values)assert.throws(()=>readLocalAiConfig({...env,[key]:value}));
});
test('invalid configuration fails before loading case or accessing secret',async()=>{
 let touched=0;await assert.rejects(()=>createLocalAiRuntime({env:{},getSecret:async()=>{touched++;},loadCaseImpl:async()=>{touched++;}}));assert.equal(touched,0);
});
test('every question is admitted without a consent field, which is now rejected',async()=>{
 const h=await setup();
 await assert.rejects(()=>h.game.act(h.code,'a',{type:'ask',question:'What did you notice?',round:1,id:id(),aiConsent:true}),/Unexpected question field\./);
 assert.equal(h.store.ai.size,0);
 const state=await h.ask('a');assert.equal(state.me.interviews[0].messages[0].status,'pending');
 assert.equal([...h.store.ai.values()].filter(v=>v.kind==='job').length,1);await h.worker.stop();
});
test('a stopped local worker resolves new questions canonically',async()=>{
 const h=await setup();await h.worker.stop();const message=(await h.ask('a')).me.interviews[0].messages[0];
 assert.equal(message.status,'canonical');assert.equal(message.reply,TRAIN_CASE.suspects[1].responses.clue);assert.equal(h.store.ai.size,0);assert.equal(h.secrets(),0);
});
test('same receipt retry and overlapping ticks make only one provider request',async()=>{
 let calls=0,release;const barrier=new Promise(r=>{release=r;});
 const h=await setup({},async()=>{calls++;await barrier;return response();});
 const request=id();await h.ask('a',request);await h.ask('a',request);
 const first=h.worker.tick(),second=h.worker.tick();assert.equal(first,second);
 await new Promise(r=>setTimeout(r,20));assert.equal(calls,1);release();await first;
 assert.equal((await h.game.view(h.code,'a')).me.interviews[0].messages[0].status,'complete');
 await h.worker.tick();assert.equal(calls,1);await h.worker.stop();
});
test('provider attempts have nonrefundable process-wide call and reserve caps',async()=>{
 let calls=0;const h=await setup({SHIFT_LOCAL_AI_MAX_CALLS:'1'},async()=>{calls++;return response();});
 await h.ask('a');await h.worker.tick();await h.ask('b');await h.worker.tick();assert.equal(calls,1);assert.equal(h.secrets(),1);assert.equal(h.worker.stats().reservedMicroUsd,4039);
 const h2=await setup({SHIFT_LOCAL_AI_MAX_CALLS:'12',SHIFT_LOCAL_AI_MAX_RESERVE_MICROUSD:'5000'},async()=>{calls++;return response();});
 await h2.ask('a');await h2.worker.tick();await h2.ask('b');await h2.worker.tick();assert.equal(h2.worker.stats().calls,1);await h2.worker.stop();await h.worker.stop();
});
test('failed provider attempts consume trial allowance and stopping prevents new work',async()=>{
 const h=await setup({SHIFT_LOCAL_AI_MAX_CALLS:'1'},async()=>{throw Error('synthetic outage');});await h.ask();await h.worker.tick();assert.equal(h.worker.stats().calls,1);
 await h.worker.stop();await h.ask('b');assert.equal((await h.worker.tick()).stopped,true);assert.equal(h.worker.stats().calls,1);assert.throws(()=>h.worker.start());
});
test('a held provider call never blocks the next local tick, which leaves further replies due',async()=>{
 let calls=0,release;const barrier=new Promise(r=>{release=r;});
 const h=await setup({},async()=>{calls++;await barrier;return response();});
 await h.ask('a');await h.ask('b');
 const first=h.worker.tick();for(let i=0;i<200&&calls<1;i++)await new Promise(r=>setImmediate(r));assert.equal(calls,1);
 assert.equal((await h.worker.tick()).stopped,true);assert.equal(calls,1);
 release();await first;await h.worker.tick();assert.equal(calls,2);
 for(const player of ['a','b'])assert.equal((await h.game.view(h.code,player)).me.interviews[0].messages[0].status,'complete');
 await h.worker.stop();
});
