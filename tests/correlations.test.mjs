import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GameService} from '../server/game.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {TRAIN_CASE, CASES} from './fixtures/case.mjs';
const id = () => randomUUID();
const source = (kind, id) => ({kind, id});
const command = (changes = {}) => ({id: id(), type: 'correlate', round: 1, expectedPhase: 'investigation', sources: [source('case', 'victim'), source('suspect', 'suspect-1')], relation: 'related', text: 'A hypothesis, not established evidence.', ...changes});
function setup() {
  const game = new GameService({caseData: TRAIN_CASE, catalog: CASES});
  const host = game.create('Host', 'demo', id());
  const players = [host, game.join(host.code, 'Second', id()), game.join(host.code, 'Third', id())];
  const act = (p, type, data = {}) => game.act(host.code, p.token, {id: id(), type, ...data});
  act(host, 'start');
  return {game, host, players, act, send: c => game.act(host.code, host.token, c), room: game.rooms.get(host.code)};
}
function rejects(s, change, status = 400) {
  const version = s.room.version, length = s.room.board.length;
  assert.throws(() => s.send(command(change)), e => e.status === status);
  assert.equal(s.room.version, version); assert.equal(s.room.board.length, length);
}
test('correlations expose only public references and server-owned authorship', () => {
  const s = setup();
  s.act(s.host, 'select', {round: 1, suspectId: 'suspect-1'});
  s.act(s.host, 'ask', {round: 1, question: 'Unshared private question', topic: 'clue'});
  const message = s.room.players[0].interviews[0].messages[0];
  message.narration = {status: 'complete', text: 'Private generated voice'};
  rejects(s, {sources: [source('clue', message.id), source('case', 'method')]});
  s.act(s.host, 'share', {messageId: message.id});
  const clue = s.room.board[0];
  const sent = command({sources: [source('clue', clue.id), source('suspect', 'suspect-1')], relation: 'supports'});
  s.send(sent);
  const other = s.game.view(s.host.code, s.players[1].token), record = other.board[1];
  assert.deepEqual(Object.keys(record).sort(), ['id','type','sources','relation','text','by','round'].sort());
  assert.equal(record.type, 'correlation'); assert.equal(record.by, 'Host'); assert.equal(record.round, 1);
  assert.equal(record.relation, 'supports'); assert.deepEqual(record.sources, sent.sources);
  assert.notEqual(record.id, sent.id);
  assert.ok(!JSON.stringify(other).includes('Unshared private question'));
  assert.ok(!JSON.stringify(other).includes('Private generated voice'));
  assert.ok(!JSON.stringify(record).includes(message.answer));
  sent.sources[0].id = 'modified-after-send';
  assert.equal(s.room.board[1].sources[0].id, clue.id);
});
test('sources and correlation shape reject untrusted or private references', () => {
  const s = setup();
  s.act(s.host, 'note', {text: 'A note is not a canonical clue'});
  const bad = [
    {sources: null}, {sources: []}, {sources: [source('case','victim')]},
    {sources: [source('case','victim'), source('case','place'), source('case','method')]},
    {sources: [source('case','victim'), source('case','victim')]},
    {sources: [null, source('case','place')]}, {sources: [[], source('case','place')]},
    {sources: [source('private','message'), source('case','place')]},
    {sources: [source('case','solution'), source('case','place')]},
    {sources: [source('case','title'), source('case','place')]},
    {sources: [source('suspect','unknown'), source('case','place')]},
    {sources: [source('clue',id()), source('case','place')]},
    {sources: [source('clue',s.room.board[0].id), source('case','place')]},
    {sources: [{kind:'case',id:'victim',title:'Forged'}, source('case','place')]},
    {by:'Forged'}, {author:'Forged'}, {title:'Forged'}, {text:''}, {text:'   '}, {text:'x'.repeat(301)},
    {text:{}}, {relation:'proves'}, {relation:null}, {round:undefined}, {expectedPhase:undefined},
  ];
  for (const change of bad) rejects(s, change);
  const foreign = setup(); foreign.act(foreign.host, 'select', {round:1,suspectId:'suspect-1'});
  foreign.act(foreign.host,'ask',{round:1,question:'Foreign question',topic:'clue'});
  foreign.act(foreign.host,'share',{messageId:foreign.room.players[0].interviews[0].messages[0].id});
  rejects(s, {sources:[source('clue',foreign.room.board[0].id),source('case','place')]});
});
test('all allowed source fields and relations are accepted without changing canonical data', () => {
  const s = setup(), before = JSON.stringify(TRAIN_CASE);
  for (const fact of ['victim','place','method','prediction']) for (const relation of ['related','supports','contradicts']) {
    s.send(command({sources:[source('case',fact),source('suspect','suspect-1')],relation,text:'x'.repeat(300)}));
  }
  assert.equal(s.room.board.length, 12); assert.equal(JSON.stringify(TRAIN_CASE), before);
});
test('closed interviews can correlate but stale first executions cannot change context', () => {
  const s = setup(); s.act(s.host,'select',{round:1,suspectId:'suspect-1'}); s.act(s.host,'end',{round:1});
  s.send(command()); rejects(s,{round:2},409); rejects(s,{expectedPhase:'accusation'},409);
  s.act(s.host,'advance',{round:1,confirmed:true}); rejects(s,{},409);
  s.act(s.host,'advance',{round:2,confirmed:true}); s.act(s.host,'advance',{round:3,confirmed:true});
  rejects(s,{round:3},409);
  s.send(command({round:3,expectedPhase:'accusation'}));
  for (const p of s.players) s.act(p,'vote',{suspectId:'suspect-0'});
  rejects(s,{round:3,expectedPhase:'accusation'});
});
test('correlations share the 60-record cap with notes and canonical clues', () => {
  const s = setup(); for (let i=0;i<59;i++) s.act(s.host,'note',{text:`Note ${i}`});
  s.send(command()); assert.equal(s.room.board.length,60); rejects(s,{});
});
async function durable() {
  const store = new MemoryStore();
  const make = () => new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES});
  const game=make(), host=await game.create('session-a','Host','demo',id());
  await game.join(host.code,'session-b','Second',id()); await game.join(host.code,'session-c','Third',id());
  await game.act(host.code,'session-a',{type:'start',id:id()});
  return {store,game,make,code:host.code,send:(c,g=game)=>g.act(host.code,'session-a',c)};
}
test('durable correlation retries preserve one original record across restart and phase change', async () => {
  const s=await durable(), request=command();
  await Promise.all([s.send(request),s.send(request,s.make())]);
  const original=(await s.game.view(s.code,'session-b')).board[0];
  await s.send({type:'advance',id:id(),round:1,confirmed:true});
  await s.send({type:'advance',id:id(),round:2,confirmed:true});
  await s.send({type:'advance',id:id(),round:3,confirmed:true});
  const replay=await s.send(request,s.make());
  assert.equal(replay.phase,'accusation'); assert.equal(replay.round,3); assert.equal(replay.board.length,1);
  assert.deepEqual(replay.board[0],original); assert.equal(replay.board[0].round,1);
  await assert.rejects(()=>s.send({...request,text:'Changed'}),e=>e.status===409);
  await assert.rejects(()=>s.send({...request,id:id()}),e=>e.status===409);
});
test('concurrent correlations cannot exceed the final board slot or create AI jobs', async () => {
  const s=await durable(); for(let i=0;i<59;i++)await s.send({type:'note',text:`Note ${i}`,id:id()});
  const results=await Promise.allSettled([s.send(command()),s.send(command(),s.make())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await s.game.view(s.code,'session-b')).board.length,60); assert.equal(s.store.ai.size,0);
});
test('correlation commands still require room membership', async () => {
  const s=await durable(); await assert.rejects(()=>s.game.act(s.code,'unrelated-session',command()),e=>e.status===401);
  assert.equal((await s.game.view(s.code,'session-a')).board.length,0);
});
