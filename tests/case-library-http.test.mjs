import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {validateCaseLibrary} from '../server/case-loader.mjs';import {caseLibrary} from './fixtures/case-library.mjs';import {startLibraryServer,httpClient} from './helpers/library-server.mjs';
test('HTTP catalog selection plays all six synthetic cases with isolated cookies, private answers and matching results',async()=>{
 const server=await startLibraryServer(validateCaseLibrary(caseLibrary));try{
 const catalog=await httpClient(server.origin)('/api/cases');assert.deepEqual(catalog.body.cases,caseLibrary.catalog);
 const rooms=[];
 for(const c of caseLibrary.cases){
  const clients=Array.from({length:3},()=>httpClient(server.origin));for(const client of clients)await client('/api/session',{});
  const created=await clients[0]('/api/rooms',{name:'Host',caseId:c.id,id:randomUUID()});assert.equal(created.status,201);assert.equal(created.body.state.case.id,c.id);const code=created.body.code;rooms.push({code,clients});
  for(let i=1;i<3;i++)assert.equal((await clients[i](`/api/rooms/${code}/join`,{name:`Agent ${i}`,id:randomUUID()})).status,200);
  const act=async(i,type,extra={})=>{const r=await clients[i](`/api/rooms/${code}/actions`,{id:randomUUID(),type,...extra});assert.equal(r.status,200);return r.body;};await act(0,'start');
  for(let round=1;round<=4;round++)for(let i=0;i<3;i++){
   await act(i,'select',{round,suspectId:`suspect-${i}`});for(const question of ['alibi','motive','clue']){
    const state=await act(i,'ask',{round,question});assert.equal(state.me.interviews.at(-1).messages.at(-1).reply,c.suspects[i].responses[question]);assert.equal(state.result,undefined);
    const other=(await clients[(i+1)%3](`/api/rooms/${code}`)).body;assert.ok(!JSON.stringify(other).includes(c.suspects[i].responses[question]));
   }
  }
  for(let i=0;i<3;i++){const state=await act(i,'vote',{suspectId:c.culpritId});if(i===2){assert.equal(state.result.culpritId,c.culpritId);assert.equal(state.result.outcome,'complete');}}
 }
 assert.equal((await rooms[0].clients[0](`/api/rooms/${rooms[1].code}`)).status,401);
 for(const path of ['/private/case.json','/private/cases/test.mjs','/examples/public-demo.mjs'])assert.equal((await httpClient(server.origin)(path)).status,404);
 }finally{await server.close();}
});
