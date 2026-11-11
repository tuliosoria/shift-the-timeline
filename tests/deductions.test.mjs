import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GameService} from '../server/game.mjs';
import {sourcesFor,resolveCanonical,resolveWithAi,deductionView,minimumSuspectCover} from '../server/deductions.mjs';
import {TRAIN_CASE as caseData,CASES as catalog} from './fixtures/case.mjs';

const room=(opts={})=>{const game=new GameService({caseData,catalog,...opts});const host=game.create('A',caseData.id,randomUUID());const players=[host,game.join(host.code,'B',randomUUID()),game.join(host.code,'C',randomUUID())];const act=(p,type,extra={})=>game.act(host.code,p.token,{id:randomUUID(),type,...extra});act(host,'start');return {game,host,players,act};};
const fakeInterview=(suspectId,round=1)=>({suspectId,round});
const fakeMessage=(topic='clue')=>({id:'m1',topic,answer:'a',status:'pending',reply:null,unlocked:[]});

test('canonical answer unlocks deductions sourced from that suspect and topic',()=>{
  const {host,act}=room();
  act(host,'select',{round:1,suspectId:'suspect-0'});
  const state=act(host,'ask',{round:1,question:'Where were you at the time, what was your alibi?'});
  const m=state.me.interviews[0].messages[0];
  assert.deepEqual(m.unlocked,['d-alibi-gap']);
  assert.deepEqual(state.me.deductions.map(d=>d.id),['d-alibi-gap']);
  assert.equal(state.me.deductions[0].suspectId,'suspect-0');
  assert.equal(state.me.deductions[0].round,1);
  assert.equal(state.deductionTotal,6);
  // a topic with no sources unlocks nothing
  const p={deductions:[]},msg=fakeMessage('relationship');
  assert.deepEqual(resolveCanonical(caseData,p,fakeInterview('suspect-0'),msg),[]);
  assert.equal(msg.status,'canonical');assert.equal(msg.reply,'a');
});
test('canonical resolution does not unlock the same deduction twice',()=>{
  const p={deductions:[]};
  assert.deepEqual(resolveCanonical(caseData,p,fakeInterview('suspect-0'),fakeMessage('alibi')),['d-alibi-gap']);
  assert.deepEqual(resolveCanonical(caseData,p,fakeInterview('suspect-1'),fakeMessage('alibi')),[]);
  assert.equal(p.deductions.length,1);
});
test("ai unlocks are filtered to the interviewed suspect's sources",()=>{
  assert.deepEqual([...sourcesFor(caseData,'suspect-0')].sort(),['d-alibi-gap','d-clue-object']);
  const p={deductions:[]},msg=fakeMessage();
  const got=resolveWithAi(caseData,p,fakeInterview('suspect-0'),msg,{reply:'hi',unlocked:['d-motive-debt','nope','d-clue-object','d-clue-object','d-alibi-gap']});
  assert.deepEqual(got,['d-clue-object','d-alibi-gap']);
  assert.equal(msg.status,'complete');assert.equal(msg.reply,'hi');assert.deepEqual(msg.unlocked,got);
  assert.deepEqual(p.deductions.map(d=>d.messageId),['m1','m1']);
  // already unlocked are dropped
  assert.deepEqual(resolveWithAi(caseData,p,fakeInterview('suspect-0'),fakeMessage(),{reply:'x',unlocked:['d-alibi-gap']}),[]);
  // cap of 3
  const big={...caseData,deductions:Array.from({length:6},(_,i)=>({id:`x${i}`,text:'t',key:i<3,sources:[{suspectId:'suspect-0',topic:'clue'}]}))};
  assert.equal(resolveWithAi(big,{deductions:[]},fakeInterview('suspect-0'),fakeMessage(),{reply:'x',unlocked:big.deductions.map(d=>d.id)}).length,3);
  assert.deepEqual(resolveWithAi(caseData,{},fakeInterview('suspect-0'),fakeMessage(),{reply:'x',unlocked:'bad'}),[]);
});
test('deductions are private',()=>{
  const {game,host,players,act}=room();
  act(host,'select',{round:1,suspectId:'suspect-0'});act(host,'ask',{round:1,question:'What was your alibi?'});
  const mine=game.view(host.code,host.token),other=game.view(host.code,players[1].token);
  assert.equal(mine.me.deductions.length,1);
  assert.deepEqual(other.me.deductions,[]);
  assert.ok(!JSON.stringify(other).includes('d-alibi-gap'));assert.ok(!JSON.stringify(other).includes(caseData.deductions[0].text));
  assert.equal(mine.deductionTotal,other.deductionTotal);
  assert.deepEqual(deductionView(caseData,{}),[]);
});
test('briefs never reach a snapshot or catalog',()=>{
  const {game,host,players,act}=room();
  act(host,'select',{round:1,suspectId:'suspect-0'});act(host,'ask',{round:1,question:'Any clue?'});
  for(const p of players){const json=JSON.stringify(game.view(host.code,p.token));for(const s of caseData.suspects)assert.ok(!json.includes(s.brief));}
  const json=JSON.stringify(game.cases());for(const s of caseData.suspects)assert.ok(!json.includes(s.brief));
  // locked deductions stay out of snapshots
  assert.ok(!JSON.stringify(game.view(host.code,host.token)).includes(caseData.deductions[1].text));
});
test('old rooms without player.deductions still resolve',()=>{
  const p={},msg=fakeMessage('alibi');
  assert.deepEqual(resolveCanonical(caseData,p,fakeInterview('suspect-1'),msg),['d-alibi-gap']);
});
test('minimumSuspectCover finds the smallest covering set of suspects',()=>{
  assert.equal(minimumSuspectCover(caseData),2);
  const mk=(deductions)=>({suspects:Array.from({length:12},(_,i)=>({id:`s${i}`})),deductions});
  const d=(id,...ss)=>({id,key:true,sources:ss.map(s=>({suspectId:s,topic:'clue'}))});
  assert.equal(minimumSuspectCover(mk([d('a','s0'),d('b','s0','s1')])),1);
  assert.equal(minimumSuspectCover(mk([d('a','s0'),d('b','s1'),d('c','s2')])),3);
  assert.equal(minimumSuspectCover(mk([d('a','s0','s1'),d('b','s1','s2'),d('c','s2','s0')])),2);
  assert.equal(minimumSuspectCover(mk(Array.from({length:10},(_,i)=>d(`k${i}`,`s${i}`)))),Infinity);
  assert.equal(minimumSuspectCover(mk([{...d('a','s0'),key:false}])),0);
});
