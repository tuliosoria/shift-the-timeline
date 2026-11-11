import test from 'node:test';
import assert from 'node:assert/strict';
import { GameService, STORY_CLOCK, DomainError } from '../server/game.mjs';
import { TRAIN_CASE, CASES } from './fixtures/case.mjs';
let seq = 0;
const id = () => `request-${++seq}-xxxxxxxxxxxxxxxx`;
function setup(count = 3, options = {}) {
  const g = new GameService({caseData:TRAIN_CASE,catalog:CASES,...options});
  const a = g.create('Agente A', TRAIN_CASE.id, id());
  const players = [a, ...Array.from({length:count-1},(_,i)=>g.join(a.code,`Agente ${i+2}`,id()))];
  const act = (p,type,data={}) => g.act(a.code,p.token,{id:id(),type,...data});
  return {g,a,players,act};
}
function finishRounds(s) {
  s.act(s.a,'start');
  for(let round=1;round<=4;round++) for(const p of s.players) {
    s.act(p,'select',{suspectId:TRAIN_CASE.suspects[0].id,round});
    for(let n=0;n<3;n++) s.act(p,'ask',{question:`Question ${n}?`,round});
  }
}
test('room admission is 3–4 people, lobby only and host starts',()=>{
  const s=setup(2);
  assert.throws(()=>s.act(s.a,'start'),/3/);
  s.players.push(s.g.join(s.a.code,'C',id()));
  assert.throws(()=>s.act(s.players[1],'start'),/host/);
  s.players.push(s.g.join(s.a.code,'D',id()));
  assert.throws(()=>s.g.join(s.a.code,'E',id()),/full/);
  s.act(s.a,'start');
  assert.throws(()=>s.g.join(s.a.code,'E',id()),/started/);
});
test('public state does not expose culprit, responses, tokens, or other interviews',()=>{
  const s=setup();s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  s.act(s.a,'ask',{question:'Minha pergunta privada',round:1});
  const own=s.g.view(s.a.code,s.a.token), other=s.g.view(s.a.code,s.players[1].token);
  assert.equal(own.me.interviews[0].messages.length,1);
  const json=JSON.stringify(other);
  for(const secret of ['culpritId','responses','Minha pergunta privada',s.a.token,TRAIN_CASE.solution.plan]) assert.ok(!json.includes(secret),secret);
  assert.throws(()=>s.g.view(s.a.code,'guess'),/session/);
});
test('each round grants one interview, three questions, and idempotent retry',()=>{
  const s=setup();s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  assert.throws(()=>s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[1].id,round:1}),/already chosen/);
  const request={id:id(),type:'ask',question:'Onde estava?',round:1};
  s.g.act(s.a.code,s.a.token,request);s.g.act(s.a.code,s.a.token,request);
  assert.equal(s.g.view(s.a.code,s.a.token).me.interviews[0].messages.length,1);
  assert.throws(()=>s.g.act(s.a.code,s.a.token,{...request,question:'Outra?'}),/reused/);
});
test('four turns of three questions reach accusation',()=>{
  const s=setup();s.act(s.a,'start');
  for(let round=1;round<=4;round++){
    assert.equal(s.g.view(s.a.code,s.a.token).round,round);
    for(const p of s.players){
      s.act(p,'select',{suspectId:TRAIN_CASE.suspects[0].id,round});
      for(let n=0;n<3;n++) s.act(p,'ask',{question:`Question ${n}?`,round});
    }
    if(round<4) assert.equal(s.g.view(s.a.code,s.a.token).round,round+1);
  }
  assert.equal(s.g.view(s.a.code,s.a.token).phase,'accusation');
});
test('third answer closes the interview and a fourth ask is rejected',()=>{
  const s=setup();s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  for(let n=0;n<3;n++) s.act(s.a,'ask',{question:`Q${n}?`,round:1});
  assert.equal(s.g.view(s.a.code,s.a.token).me.interviews[0].closed,true);
  assert.throws(()=>s.act(s.a,'ask',{question:'Again?',round:1}),e=>e instanceof DomainError&&e.message==='Interview already closed.');
});
test('asking while the previous answer is pending is rejected',()=>{
  const s=setup(3,{deferAnswers:true});s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  s.act(s.a,'ask',{question:'First?',round:1});
  assert.throws(()=>s.act(s.a,'ask',{question:'Second?',round:1}),e=>e.status===409&&e.message==='Wait for the answer before asking again.');
});
test('snapshot never exposes canonical answer while pending',()=>{
  const s=setup(3,{deferAnswers:true});s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  const state=s.act(s.a,'ask',{question:'First?',round:1});
  const m=state.me.interviews[0].messages[0];
  assert.equal(m.status,'pending');assert.equal(m.reply,null);assert.ok(!('answer' in m));
  assert.deepEqual(m.unlocked,[]);
  assert.deepEqual(state.me.deductions,[]);assert.equal(state.deductionTotal,0);
});
test('clock follows the story',()=>{
  assert.deepEqual([...STORY_CLOCK],['20:00','02:00','08:00','14:00']);
  const s=setup();s.act(s.a,'start');
  [[ '20:00',24],['02:00',18],['08:00',12],['14:00',6]].forEach(([time,hoursLeft],i)=>{
    const clock=s.g.view(s.a.code,s.a.token).clock;
    assert.deepEqual(clock,{turn:i+1,time,hoursLeft,crimeAt:'20:00'});
    s.act(s.a,'advance',{round:i+1,confirmed:true});
  });
  assert.equal(s.g.view(s.a.code,s.a.token).clock.hoursLeft,0);
});
test('same topic may be asked twice',()=>{
  const s=setup();s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  s.act(s.a,'ask',{question:'Where were you?',round:1});
  s.act(s.a,'ask',{question:'Where were you?',round:1});
  assert.equal(s.g.view(s.a.code,s.a.token).me.interviews[0].messages.length,2);
});
test('removed actions are unknown',()=>{
  const s=setup();s.act(s.a,'start');
  for(const type of ['end','share','note','correlate']) assert.throws(()=>s.act(s.a,type,{round:1}),/Unknown action\./);
  assert.ok(!('board' in s.g.view(s.a.code,s.a.token)));
});
test('ask rejects unexpected fields',()=>{
  const s=setup();s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  for(const extra of [{topic:'clue'},{aiConsent:true}]) assert.throws(()=>s.act(s.a,'ask',{question:'Q?',round:1,...extra}),/Unexpected question field\./);
});
test('four synchronous turns end in accusation with no further selection',()=>{
  const s=setup(4);finishRounds(s);
  const state=s.g.view(s.a.code,s.a.token);
  assert.equal(state.phase,'accusation');assert.equal(state.clock.hoursLeft,0);
  assert.throws(()=>s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:5}),/phase/);
});
for(const [correct,outcome] of [[0,'defeat'],[1,'partial'],[3,'complete']]) test(`server resolves ${outcome} and never exposes early ballots`,()=>{
  const s=setup();finishRounds(s);
  const innocent=TRAIN_CASE.suspects.find(p=>p.id!==TRAIN_CASE.culpritId).id;
  s.players.forEach((p,i)=>{
    s.act(p,'vote',{suspectId:i<correct?TRAIN_CASE.culpritId:innocent});
    if(i<2){const view=s.g.view(s.a.code,s.players[2].token);assert.equal(view.result,undefined);assert.ok(view.players.every(p=>!('vote' in p)));}
  });
  const result=s.g.view(s.a.code,s.a.token).result;
  assert.equal(result.outcome,outcome);assert.equal(result.correct,correct);assert.equal(result.innocentArrests,correct===3?0:1);
  assert.throws(()=>s.act(s.a,'vote',{suspectId:innocent}),/phase/);
});
test('entry retries are stable and cannot reuse request id with other arguments',()=>{
  const g=new GameService({caseData:TRAIN_CASE,catalog:CASES}),request=id();
  const a=g.create('A',TRAIN_CASE.id,request), b=g.create('A',TRAIN_CASE.id,request);
  assert.equal(a.token,b.token);assert.equal(a.code,b.code);
  assert.throws(()=>g.create('B',TRAIN_CASE.id,request),/reused/);
  const joinId=id(),j=g.join(a.code,'B',joinId),j2=g.join(a.code,'B',joinId);
  assert.equal(j.token,j2.token);assert.equal(j2.state.players.length,2);
});
test('host advance requires confirmation and current round; stale packets cannot skip turn',()=>{
  const s=setup();s.act(s.a,'start');
  assert.throws(()=>s.act(s.a,'advance',{round:1}),/confirm/i);
  assert.throws(()=>s.act(s.players[1],'advance',{round:1,confirmed:true}),/host/);
  s.act(s.a,'advance',{round:1,confirmed:true});
  assert.equal(s.g.view(s.a.code,s.a.token).round,2);
  assert.throws(()=>s.act(s.a,'advance',{round:1,confirmed:true}),/round/);
});
test('idle rooms expire without leaking contents',()=>{
  let now=0; const g=new GameService({caseData:TRAIN_CASE,catalog:CASES,now:()=>now});const a=g.create('A',TRAIN_CASE.id,id());
  now=6*60*60*1000+1;assert.throws(()=>g.view(a.code,a.token),/expir/);
});
test('malformed inputs are rejected rather than coerced',()=>{
  const g=new GameService({caseData:TRAIN_CASE,catalog:CASES});assert.throws(()=>g.create({},TRAIN_CASE.id,id()),/name/i);
  assert.throws(()=>g.create('A','cruise',id()),/available/);
  const s=setup();assert.throws(()=>s.act(s.a,'unexpected'),/action/);
});
