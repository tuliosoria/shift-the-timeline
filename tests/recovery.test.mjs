import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GameService,RECOVERY_DELAY_MS} from '../server/game.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {MemoryStore,ConflictError} from '../server/storage/memory.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
const id=()=>randomUUID();
const innocent=TRAIN_CASE.suspects.find(s=>s.id!==TRAIN_CASE.culpritId).id;
function setup(){
 let time=1_000;const now=()=>time,g=new GameService({caseData:TRAIN_CASE,catalog:CASES,now});
 const a=g.create('Host',TRAIN_CASE.id,id());const players=[a,g.join(a.code,'Second',id()),g.join(a.code,'Third',id())];
 const act=(i,type,data={})=>g.act(a.code,players[i].token,{id:id(),type,...data});
 const view=(i=0)=>g.view(a.code,players[i].token);
 const accusation=()=>{act(0,'start');for(let round=1;round<=3;round++)act(0,'advance',{round,confirmed:true});};
 return {g,a,players,act,view,accusation,now,set:n=>{time=n;},tick:n=>{time+=n;}};
}
async function durable(){
 let time=1_000;const now=()=>time,store=new MemoryStore(),game=new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES,now});
 const sessions=['host-session','second-session','third-session'];const a=await game.create(sessions[0],'Host',TRAIN_CASE.id,id());
 for(let i=1;i<3;i++)await game.join(a.code,sessions[i],`Player ${i}`,id());
 const act=(i,type,data={})=>game.act(a.code,sessions[i],{id:id(),type,...data});
 const accusation=async()=>{await act(0,'start');for(let round=1;round<=3;round++)await act(0,'advance',{round,confirmed:true});};
 return {game,store,sessions,a,act,accusation,now,set:n=>{time=n;},tick:n=>{time+=n;}};
}
test('host takeover requires confirmation and 120 seconds; authenticated heartbeat renews lease',()=>{
 const s=setup();assert.equal(s.view(1).hostRecoverable,false);
 assert.equal(s.g.room(s.a.code).players[0].lastSeenAt,s.now());
 s.tick(RECOVERY_DELAY_MS-1);assert.throws(()=>s.act(1,'claimHost',{confirmed:true}),e=>e.status===409);
 s.tick(1);assert.equal(s.view(1).hostRecoverable,true);
 assert.throws(()=>s.act(1,'claimHost'),/Confirm/);
 s.act(0,'heartbeat');assert.equal(s.view(1).hostRecoverable,false);
 assert.throws(()=>s.act(1,'claimHost',{confirmed:true}),e=>e.status===409);
 s.tick(RECOVERY_DELAY_MS);const recovered=s.act(1,'claimHost',{confirmed:true});
 assert.equal(recovered.me.host,true);assert.equal(recovered.players.length,3);
 assert.equal(s.view(2).hostRecoverable,false);
 assert.throws(()=>s.act(0,'start'),/Only the host/);
 assert.equal(s.act(1,'start').phase,'investigation');
});
test('failed commands and reads do not renew presence; only successful commands do',()=>{
 const s=setup();s.tick(RECOVERY_DELAY_MS);
 assert.throws(()=>s.act(0,'unknown'),/Unknown/);
 s.view(0);assert.equal(s.view(1).hostRecoverable,true);
 s.act(0,'start');assert.equal(s.view(1).hostRecoverable,false);
 s.tick(RECOVERY_DELAY_MS);assert.throws(()=>s.g.act(s.a.code,'invalid',{id:id(),type:'heartbeat'}),e=>e.status===401);
 assert.equal(s.view(1).hostRecoverable,true);
});
test('heartbeats do not grow engine request map or extend idle room lifetime',()=>{
 const s=setup(),room=s.g.room(s.a.code),touched=room.touchedAt,size=room.players[0].requests.size;
 for(let i=0;i<30;i++){s.tick(10_000);s.act(0,'heartbeat');}
 assert.equal(room.players[0].requests.size,size);assert.equal(room.touchedAt,touched);
 assert.equal(room.players[0].lastSeenAt,s.now());
 s.set(touched+6*3_600_000+1);assert.throws(()=>s.act(0,'heartbeat'),e=>e.status===404);
});
test('legacy missing timestamps are initialized once from old touchedAt and never follow other activity',()=>{
 const s=setup(),room=s.g.room(s.a.code),old=room.touchedAt;
 for(const p of room.players)delete p.lastSeenAt;
 s.tick(RECOVERY_DELAY_MS-1);s.act(1,'heartbeat');
 assert.equal(room.players[0].lastSeenAt,old);assert.equal(room.players[2].lastSeenAt,old);
 s.act(1,'heartbeat');s.tick(1);assert.equal(s.view(1).hostRecoverable,true);
 s.act(1,'claimHost',{confirmed:true});assert.equal(room.players[0].lastSeenAt,old);
});
test('accusation recovery gives every missing voter a fresh full phase window and preserves ballot privacy',()=>{
 const s=setup();s.tick(RECOVERY_DELAY_MS*2);s.accusation();
 const room=s.g.room(s.a.code);assert.equal(room.accusationStartedAt,s.now());
 s.act(0,'vote',{suspectId:TRAIN_CASE.culpritId});
 assert.equal(s.view().canFinalizeAccusations,false);
 assert.throws(()=>s.act(0,'finalizeAccusations',{confirmed:true}),e=>e.status===409);
 s.tick(RECOVERY_DELAY_MS-1);assert.equal(s.view().canFinalizeAccusations,false);
 s.tick(1);assert.equal(s.view().canFinalizeAccusations,true);
 assert.equal(s.view(1).canFinalizeAccusations,false);
 const snapshot=s.view(1);assert.equal(snapshot.result,undefined);assert.equal(snapshot.me.vote,null);
 assert.ok(snapshot.players.every(p=>!('vote'in p)&&!('suspectId'in p)));
 assert.throws(()=>s.act(1,'finalizeAccusations',{confirmed:true}),/Only the host/);
 assert.throws(()=>s.act(0,'finalizeAccusations'),/Confirm/);
 const result=s.act(0,'finalizeAccusations',{confirmed:true}).result;
 assert.equal(result.outcome,'partial');assert.equal(result.abstentions,2);assert.equal(result.total,3);assert.equal(result.innocentArrests,0);
 assert.deepEqual(result.votes.slice(1).map(v=>v.suspectId),[null,null]);
});
test('host must vote first; a missing voter heartbeat prevents finalizing until it becomes idle again',()=>{
 const s=setup();s.accusation();s.tick(RECOVERY_DELAY_MS);
 assert.equal(s.view().canFinalizeAccusations,false);
 assert.throws(()=>s.act(0,'finalizeAccusations',{confirmed:true}),e=>e.status===409);
 s.act(0,'vote',{suspectId:TRAIN_CASE.culpritId});assert.equal(s.view().canFinalizeAccusations,true);
 s.act(1,'heartbeat');assert.equal(s.view().canFinalizeAccusations,false);
 s.tick(RECOVERY_DELAY_MS-1);assert.throws(()=>s.act(0,'finalizeAccusations',{confirmed:true}),e=>e.status===409);
 s.tick(1);assert.equal(s.view().canFinalizeAccusations,true);
});
for(const [votes,outcome,arrests,abstentions] of [
 [[TRAIN_CASE.culpritId,TRAIN_CASE.culpritId,TRAIN_CASE.culpritId],'complete',0,0],
 [[TRAIN_CASE.culpritId,innocent,null],'partial',1,1],
 [[innocent,null,null],'defeat',1,2],
 [[TRAIN_CASE.culpritId,null,null],'partial',0,2],
])test(`${outcome}: missing ballots remain abstentions, never invented innocent arrests`,()=>{
 const s=setup();s.accusation();votes.forEach((vote,i)=>{if(vote)s.act(i,'vote',{suspectId:vote});});
 if(abstentions){s.tick(RECOVERY_DELAY_MS);s.act(0,'finalizeAccusations',{confirmed:true});}
 const state=s.view();assert.equal(state.phase,'reveal');assert.equal(state.result.outcome,outcome);
 assert.equal(state.result.abstentions,abstentions);assert.equal(state.result.innocentArrests,arrests);assert.equal(state.result.total,3);
 assert.equal(state.hostRecoverable,false);assert.equal(state.canFinalizeAccusations,false);
 assert.throws(()=>s.act(0,'heartbeat'),/finished/);assert.throws(()=>s.act(1,'claimHost',{confirmed:true}),e=>e.status===409);
 assert.throws(()=>s.act(0,'finalizeAccusations',{confirmed:true}),/phase/);
});
test('legacy accusation phase gets conservative fallback even after host activity',()=>{
 const s=setup();s.accusation();const room=s.g.room(s.a.code),old=room.touchedAt;
 delete room.accusationStartedAt;for(const p of room.players)delete p.lastSeenAt;
 s.tick(30_000);s.act(0,'vote',{suspectId:TRAIN_CASE.culpritId});
 assert.equal(room.accusationStartedAt,old);assert.equal(room.players[1].lastSeenAt,old);
 s.set(old+RECOVERY_DELAY_MS);assert.equal(s.view().canFinalizeAccusations,true);
});
test('durable heartbeat preserves expiry, persists presence and deduplicates receipt without request-map growth',async()=>{
 const s=await durable(),before=await s.store.getRoom(s.a.code),command={id:id(),type:'heartbeat'};
 s.tick(30_000);await s.game.act(s.a.code,s.sessions[0],command);const once=await s.store.getRoom(s.a.code);
 assert.equal(once.expiresAt,before.expiresAt);assert.equal(once.touchedAt,before.touchedAt);
 assert.equal(once.players[0].lastSeenAt,s.now());assert.equal(once.players[0].requests.size,before.players[0].requests.size);
 s.tick(30_000);await s.game.act(s.a.code,s.sessions[0],command);const twice=await s.store.getRoom(s.a.code);
 assert.equal(twice.version,once.version);assert.equal(twice.players[0].lastSeenAt,once.players[0].lastSeenAt);
 await assert.rejects(()=>s.game.act(s.a.code,s.sessions[0],{...command,unexpected:true}),e=>e.status===409);
 s.set(before.expiresAt);await assert.rejects(()=>s.act(0,'heartbeat'),e=>e.status===404);
});
test('durable claim CAS rechecks renewed host timestamp instead of stealing an active lease',async()=>{
 const s=await durable();s.tick(RECOVERY_DELAY_MS);
 const original=s.store.commitRoom.bind(s.store);let raced=false;
 s.store.commitRoom=async tx=>{
  if(!raced&&tx.room.hostId!==tx.room.players[0].id){raced=true;await s.act(0,'heartbeat');throw new ConflictError();}
  return original(tx);
 };
 await assert.rejects(()=>s.act(1,'claimHost',{confirmed:true}),e=>e.status===409);
 assert.equal((await s.game.view(s.a.code,s.sessions[0])).me.host,true);
});
test('durable finalize CAS rechecks a concurrent missing-voter heartbeat',async()=>{
 const s=await durable();await s.accusation();await s.act(0,'vote',{suspectId:TRAIN_CASE.culpritId});s.tick(RECOVERY_DELAY_MS);
 const original=s.store.commitRoom.bind(s.store);let raced=false;
 s.store.commitRoom=async tx=>{
  if(!raced&&tx.room.phase==='reveal'){raced=true;await s.act(1,'heartbeat');throw new ConflictError();}
  return original(tx);
 };
 await assert.rejects(()=>s.act(0,'finalizeAccusations',{confirmed:true}),e=>e.status===409);
 const state=await s.game.view(s.a.code,s.sessions[1]);assert.equal(state.phase,'accusation');assert.equal(state.result,undefined);
});
test('concurrent durable claim receipts converge on one host, and identical retries do not mutate again',async()=>{
 const s=await durable();s.tick(RECOVERY_DELAY_MS);
 const command={id:id(),type:'claimHost',confirmed:true};
 await Promise.all([s.game.act(s.a.code,s.sessions[1],command),s.game.act(s.a.code,s.sessions[1],command)]);
 const state=await s.game.view(s.a.code,s.sessions[1]);assert.equal(state.me.host,true);
 assert.equal((await s.game.act(s.a.code,s.sessions[1],command)).version,state.version);
 await assert.rejects(()=>s.act(2,'claimHost',{confirmed:true}),e=>e.status===409);
});
test('finalization retries are durable after reveal and keep the original null ballots',async()=>{
 const s=await durable();await s.accusation();await s.act(0,'vote',{suspectId:TRAIN_CASE.culpritId});s.tick(RECOVERY_DELAY_MS);
 const command={id:id(),type:'finalizeAccusations',confirmed:true};
 const first=await s.game.act(s.a.code,s.sessions[0],command);
 const replay=await new DurableGame({store:s.store,caseData:TRAIN_CASE,catalog:CASES,now:s.now}).act(s.a.code,s.sessions[0],command);
 assert.equal(replay.version,first.version);assert.deepEqual(replay.result,first.result);
 assert.equal(replay.result.abstentions,2);assert.equal(replay.result.innocentArrests,0);
});
test('durable finalization preserves a vote committed concurrently instead of replacing it with abstention',async()=>{
 const s=await durable();await s.accusation();await s.act(0,'vote',{suspectId:TRAIN_CASE.culpritId});s.tick(RECOVERY_DELAY_MS);
 const original=s.store.commitRoom.bind(s.store);let raced=false;
 s.store.commitRoom=async tx=>{
  if(!raced&&tx.room.phase==='reveal'){raced=true;await s.act(1,'vote',{suspectId:TRAIN_CASE.culpritId});throw new ConflictError();}
  return original(tx);
 };
 const state=await s.act(0,'finalizeAccusations',{confirmed:true});
 assert.equal(state.phase,'reveal');assert.equal(state.result.correct,2);assert.equal(state.result.abstentions,1);
 assert.equal(state.result.votes[1].suspectId,TRAIN_CASE.culpritId);
});
test('durable legacy player timestamps survive heartbeat persistence without changing expiry',async()=>{
 const s=await durable(),legacy=s.store.rooms.get(s.a.code),baseline=legacy.touchedAt,expires=legacy.expiresAt;
 for(const p of legacy.players)delete p.lastSeenAt;
 s.tick(30_000);await s.act(1,'heartbeat');let room=await s.store.getRoom(s.a.code);
 assert.equal(room.players[0].lastSeenAt,baseline);assert.equal(room.players[2].lastSeenAt,baseline);assert.equal(room.expiresAt,expires);
 s.tick(RECOVERY_DELAY_MS-30_000);await s.act(1,'heartbeat');
 room=await s.store.getRoom(s.a.code);assert.equal(room.players[0].lastSeenAt,baseline);
 assert.equal((await s.game.view(s.a.code,s.sessions[1])).hostRecoverable,true);
});
