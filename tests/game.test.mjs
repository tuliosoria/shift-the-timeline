import test from 'node:test';
import assert from 'node:assert/strict';
import { GameService } from '../server/game.mjs';
import { TRAIN_CASE, CASES } from './fixtures/case.mjs';
let seq = 0;
const id = () => `request-${++seq}-xxxxxxxxxxxxxxxx`;
function setup(count = 3) {
  const g = new GameService({caseData:TRAIN_CASE,catalog:CASES});
  const a = g.create('Agente A', TRAIN_CASE.id, id());
  const players = [a, ...Array.from({length:count-1},(_,i)=>g.join(a.code,`Agente ${i+2}`,id()))];
  const act = (p,type,data={}) => g.act(a.code,p.token,{id:id(),type,...data});
  return {g,a,players,act};
}
function finishRounds(s) {
  s.act(s.a,'start');
  for(let round=1;round<=3;round++) for(const p of s.players) {
    s.act(p,'select',{suspectId:TRAIN_CASE.suspects[0].id,round});
    s.act(p,'end',{round});
  }
}
test('room admission is 3–4 people, lobby only and host starts',()=>{
  const s=setup(2);
  assert.throws(()=>s.act(s.a,'start'),/3/);
  s.players.push(s.g.join(s.a.code,'C',id()));
  assert.throws(()=>s.act(s.players[1],'start'),/anfitri/);
  s.players.push(s.g.join(s.a.code,'D',id()));
  assert.throws(()=>s.g.join(s.a.code,'E',id()),/lotada/);
  s.act(s.a,'start');
  assert.throws(()=>s.g.join(s.a.code,'E',id()),/iniciada/);
});
test('public state does not expose culprit, responses, tokens, or other interviews',()=>{
  const s=setup();s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  s.act(s.a,'ask',{topic:'clue',question:'Minha pergunta privada',round:1});
  const own=s.g.view(s.a.code,s.a.token), other=s.g.view(s.a.code,s.players[1].token);
  assert.equal(own.me.interviews[0].messages.length,1);
  const json=JSON.stringify(other);
  for(const secret of ['culpritId','responses','Minha pergunta privada',s.a.token,TRAIN_CASE.solution.plan]) assert.ok(!json.includes(secret),secret);
  assert.throws(()=>s.g.view(s.a.code,'guess'),/sessão/);
});
test('each round grants one interview, four questions, and idempotent retry',()=>{
  const s=setup();s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  assert.throws(()=>s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[1].id,round:1}),/escolheu/);
  const request={id:id(),type:'ask',topic:'alibi',question:'Onde estava?',round:1};
  s.g.act(s.a.code,s.a.token,request);s.g.act(s.a.code,s.a.token,request);
  assert.equal(s.g.view(s.a.code,s.a.token).me.interviews[0].messages.length,1);
  assert.throws(()=>s.g.act(s.a.code,s.a.token,{...request,topic:'clue'}),/reutilizado/);
  for(let i=0;i<3;i++)s.act(s.a,'ask',{topic:'clue',question:'O que viu?',round:1});
  assert.throws(()=>s.act(s.a,'ask',{topic:'clue',question:'Outra?',round:1}),/4/);
  s.act(s.a,'end',{round:1});
  assert.throws(()=>s.act(s.a,'ask',{topic:'clue',question:'Outra?',round:1}),/encerrada/);
});
test('sharing is explicit, only own messages and plain text',()=>{
  const s=setup();s.act(s.a,'start');
  s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:1});
  const state=s.act(s.a,'ask',{topic:'clue',question:'O que viu?',round:1});
  const messageId=state.me.interviews[0].messages[0].id;
  assert.equal(s.g.view(s.a.code,s.players[1].token).board.length,0);
  assert.throws(()=>s.act(s.players[1],'share',{messageId}),/encontrada/);
  s.act(s.a,'share',{messageId});s.act(s.a,'share',{messageId});
  assert.equal(s.g.view(s.a.code,s.players[1].token).board.length,1);
  assert.throws(()=>s.act(s.a,'note',{text:'x'.repeat(501)}),/500/);
});
test('three synchronous rounds yield only 12 available interviews for 15 suspects',()=>{
  const s=setup(4);finishRounds(s);
  const state=s.g.view(s.a.code,s.a.token);
  assert.equal(state.phase,'accusation');assert.equal(state.remainingHours,0);
  assert.ok(state.suspects.length>state.players.length*state.config.rounds);
  assert.throws(()=>s.act(s.a,'select',{suspectId:TRAIN_CASE.suspects[0].id,round:4}),/fase/);
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
  assert.throws(()=>s.act(s.a,'vote',{suspectId:innocent}),/fase/);
});
test('entry retries are stable and cannot reuse request id with other arguments',()=>{
  const g=new GameService({caseData:TRAIN_CASE,catalog:CASES}),request=id();
  const a=g.create('A',TRAIN_CASE.id,request), b=g.create('A',TRAIN_CASE.id,request);
  assert.equal(a.token,b.token);assert.equal(a.code,b.code);
  assert.throws(()=>g.create('B',TRAIN_CASE.id,request),/reutilizado/);
  const joinId=id(),j=g.join(a.code,'B',joinId),j2=g.join(a.code,'B',joinId);
  assert.equal(j.token,j2.token);assert.equal(j2.state.players.length,2);
});
test('host advance requires confirmation and current round; stale packets cannot skip turn',()=>{
  const s=setup();s.act(s.a,'start');
  assert.throws(()=>s.act(s.a,'advance',{round:1}),/confirm/);
  assert.throws(()=>s.act(s.players[1],'advance',{round:1,confirmed:true}),/anfitri/);
  s.act(s.a,'advance',{round:1,confirmed:true});
  assert.equal(s.g.view(s.a.code,s.a.token).round,2);
  assert.throws(()=>s.act(s.a,'advance',{round:1,confirmed:true}),/turno/);
});
test('idle rooms expire without leaking contents',()=>{
  let now=0; const g=new GameService({caseData:TRAIN_CASE,catalog:CASES,now:()=>now});const a=g.create('A',TRAIN_CASE.id,id());
  now=6*60*60*1000+1;assert.throws(()=>g.view(a.code,a.token),/expir/);
});
test('malformed inputs are rejected rather than coerced',()=>{
  const g=new GameService({caseData:TRAIN_CASE,catalog:CASES});assert.throws(()=>g.create({},TRAIN_CASE.id,id()),/nome/i);
  assert.throws(()=>g.create('A','cruise',id()),/disponível/);
  const s=setup();assert.throws(()=>s.act(s.a,'unexpected'),/Ação/);
});
