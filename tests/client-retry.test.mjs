import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
import {uiContext} from '../public/ui-state.js';
import {randomUUID} from 'node:crypto';
import {MemoryStore} from '../server/storage/memory.mjs';
import {Sessions} from '../server/sessions.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {DomainError} from '../server/game.mjs';
import {createApi} from '../server/api.mjs';
import {TRAIN_CASE, CASES} from './fixtures/case.mjs';

test('rate limit after a lost committed response preserves the original question receipt', async () => {
  const store = new MemoryStore(), sessions = new Sessions({store, secure: false});
  const game = new DurableGame({store, caseData: TRAIN_CASE, catalog: CASES});
  const origin = 'http://shift.example';
  let limited = false;
  const api = createApi({game, sessions, allowedOrigin: origin, rateLimit: async () => {
    if (limited) throw new DomainError('Aguarde antes de tentar novamente.', 429);
  }});
  const request = (path, body, cookie) => new Request(origin + path, {
    method: 'POST', headers: {origin, 'content-type': 'application/json', ...(cookie ? {cookie} : {})},
    body: JSON.stringify(body),
  });
  const identities = [];
  for (let i = 0; i < 3; i++) {
    const bootstrap = await api(request('/api/session', {}));
    assert.equal(bootstrap.status, 201);
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    identities.push({cookie, hash: (await sessions.resolve(cookie)).hash});
  }
  const joined = await game.create(identities[0].hash, 'Host', 'demo', randomUUID());
  for (let i = 1; i < 3; i++) await game.join(joined.code, identities[i].hash, `Agent ${i}`, randomUUID());
  await game.act(joined.code, identities[0].hash, {type: 'start', id: randomUUID()});
  await game.act(joined.code, identities[0].hash, {type: 'select', round: 1, suspectId: 'suspect-1', id: randomUUID()});
  const initial=await game.view(joined.code,identities[0].hash),h=clientHarness(initial),context=uiContext(initial),responses=[];
  const body={type:'ask',round:1,question:'One unique question',topic:'clue',id:randomUUID()};
  h.client.ui.writeDraft(context,'question',body.question);
  h.sandbox.fetch=async(path,options)=>{
    const parsed=JSON.parse(options.body),response=await api(request(path,parsed,identities[0].cookie));
    responses.push({status:response.status,id:parsed.id});
    if(responses.length===1&&response.ok)throw new Error('Committed response was lost');
    return response;
  };
  assert.equal(await h.client.command(`/api/rooms/${joined.code}/actions`,body),false);
  assert.equal((await game.view(joined.code,identities[0].hash)).me.interviews[0].messages.length,1);
  limited=true;assert.equal(await h.client.runPending(),false);
  assert.equal(h.client.read().pending?.body.id,body.id);assert.equal(JSON.parse(h.saved.get('shift-pending')).body.id,body.id);
  assert.equal(h.client.ui.read(context).question,body.question);
  limited=false;assert.equal(await h.client.runPending(),true);
  assert.deepEqual(responses,[200,429,200].map(status=>({status,id:body.id})));
  assert.equal(h.client.read().state.me.interviews[0].messages.length,1);assert.equal(h.client.read().pending,null);assert.equal(h.saved.has('shift-pending'),false);
  assert.equal(h.client.ui.read(context).question,'');
});
test('a definitive validation rejection clears the pending request and keeps its draft',async()=>{
 const initial=clientState(),h=clientHarness(initial),context=uiContext(initial),body={type:'ask',id:'invalid-request-xxxx',question:'Invalid draft'};
 h.client.ui.writeDraft(context,'question',body.question);
 h.sandbox.fetch=async()=>({ok:false,status:400,json:async()=>({error:'Invalid question.'})});
 assert.equal(await h.client.command('/api/test',body),false);assert.equal(h.client.read().pending,null);assert.equal(h.client.read().busy,false);
 assert.equal(h.saved.has('shift-pending'),false);assert.equal(h.client.ui.read(context).question,body.question);
});
