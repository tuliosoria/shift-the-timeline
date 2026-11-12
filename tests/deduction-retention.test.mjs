import test from 'node:test';
import assert from 'node:assert/strict';
import {DurableGame} from '../server/persistent-game.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {encodePostgresRoom,decodePostgresRoom} from '../server/storage/postgres.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
import {harness,id,fakeProvider} from './helpers/ai.mjs';
import {runJob} from '../server/ai/worker.mjs';

// Exercise the production JSON representation on every durable read/write, not just
// structuredClone: PostgreSQL stores JSONB and reconstructs request Maps on load.
class JsonRoomStore extends MemoryStore {
 async getRoom(code){const room=await super.getRoom(code);return room?decodePostgresRoom(JSON.parse(JSON.stringify(encodePostgresRoom(room)))):null;}
}
const reopened=(store,now=Date.now)=>new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES,now});

test('earned deductions and source answers survive automatic turns, JSON persistence and service restart',async()=>{
 const store=new JsonRoomStore();let game=reopened(store);
 const created=await game.create('a','A',TRAIN_CASE.id,id()),code=created.code;
 for(const who of ['b','c'])await game.join(code,who,who.toUpperCase(),id());
 const act=(who,type,extra={})=>game.act(code,who,{id:id(),type,...extra});
 await act('a','start');let earned;
 for(let round=1;round<=4;round++){
  for(const who of ['a','b','c'])await act(who,'select',{round,suspectId:who==='a'?'suspect-0':'suspect-2'});
  for(let question=0;question<3;question++)for(const who of ['a','b','c']){
   const view=await act(who,'ask',{round,question:who==='a'?'What is your alibi?':'Do you know the victim?'});
   if(who==='a'&&round===1&&question===0)earned=view.me.deductions;
  }
  game=reopened(store);
  const view=await game.view(code,'a');
  assert.deepEqual(view.me.deductions,earned);
  assert.equal(view.me.deductions.length,1);
  assert.equal(view.me.deductions[0].round,1);
  assert.equal(view.me.interviews[0].messages[0].unlocked[0],earned[0].id);
  assert.equal(view.me.deductions[0].messageId,view.me.interviews[0].messages[0].id);
  for(const who of ['b','c'])assert.deepEqual((await game.view(code,who)).me.deductions,[]);
 }
 assert.equal((await game.view(code,'a')).phase,'accusation');
});

test('late AI awards remain after next-turn writes and repeated settlement without leaking to teammates',async()=>{
 const h=await harness({}, {store:new JsonRoomStore()});
 await h.ask('session-A',id(),'What is your alibi?');const job=h.jobList()[0];
 await h.game.act(h.code,'session-A',{id:id(),type:'advance',round:1,confirmed:true});
 const run=()=>runJob({enabled:true,repository:h.jobs,jobId:job.id,provider:fakeProvider({reply:'Recorded evidence.',unlocked:['d-alibi-gap']}),now:h.now});
 await run();
 const before=(await h.game.view(h.code,'session-A')).me.deductions;
 assert.equal(before.length,1);
 await h.game.act(h.code,'session-A',{id:id(),type:'select',round:2,suspectId:'suspect-2'});
 await run(); // delivery retries cannot duplicate or erase a prior-turn award
 await h.game.act(h.code,'session-B',{id:id(),type:'heartbeat'});
 const restored=reopened(h.store,h.now);
 assert.deepEqual((await restored.view(h.code,'session-A')).me.deductions,before);
 assert.deepEqual((await restored.view(h.code,'session-B')).me.deductions,[]);
});
