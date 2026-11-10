import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';

test('a due heartbeat rejected because another player revealed does not permanently block state polling',async()=>{
 const before=clientState({phase:'accusation'});
 before.me.vote='ben';
 const revealed={...before,version:before.version+1,phase:'reveal',result:{outcome:'complete',culpritId:'ben',correct:3,total:3,innocentArrests:0,abstentions:0,solution:{motive:'Synthetic',plan:'Synthetic',evidence:[],timeline:[]},votes:[]}};
 const h=clientHarness(before);let now=100000;
 h.sandbox.Date={now:()=>now};
 h.sandbox.fetch=async(path,options)=>{
  const body=options.body?JSON.parse(options.body):null;
  h.requests.push({path,body});
  // Exact rejection from GameService.act's heartbeat branch in reveal.
  if(body?.type==='heartbeat')return {ok:false,status:400,json:async()=>({error:'This game has finished.'})};
  return {ok:true,status:200,json:async()=>structuredClone(revealed)};
 };
 await h.client.poll();now+=3000;await h.client.poll();now+=3000;await h.client.poll();
 assert.equal(h.client.read().state.phase,'reveal',`Stuck after requests: ${JSON.stringify(h.requests)}`);
 assert.ok(h.requests.some(r=>r.body===null),'Authoritative state must still be fetched after a stale heartbeat');
});

import {randomUUID} from 'node:crypto';
import {MemoryStore} from '../server/storage/memory.mjs';
import {Sessions} from '../server/sessions.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {createApi} from '../server/api.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';

test('real API final-vote transition is observed by a client whose heartbeat is due',async()=>{
 const now=100000,store=new MemoryStore(),sessions=new Sessions({store,now:()=>now,secure:false});
 const game=new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES,now:()=>now});
 const ids=await Promise.all(Array.from({length:3},()=>sessions.create()));
 const {code}=await game.create(ids[0].hash,'Host','demo',randomUUID());
 for(let i=1;i<3;i++)await game.join(code,ids[i].hash,`Agent ${i}`,randomUUID());
 const action=(i,data)=>game.act(code,ids[i].hash,{id:randomUUID(),...data});
 await action(0,{type:'start'});
 for(let round=1;round<=3;round++)await action(0,{type:'advance',round,confirmed:true});
 for(let i=0;i<2;i++)await action(i,{type:'vote',suspectId:TRAIN_CASE.culpritId});
 const h=clientHarness(await game.view(code,ids[0].hash));h.sandbox.Date={now:()=>now};
 await action(2,{type:'vote',suspectId:TRAIN_CASE.culpritId});
 const origin='http://audit.invalid',api=createApi({game,sessions,allowedOrigin:origin,rateLimit:async()=>{}}),statuses=[];
 h.sandbox.fetch=async(path,options)=>{
  const response=await api(new Request(origin+path,{method:options.method,headers:{...options.headers,origin,cookie:ids[0].cookie.split(';')[0]},...(options.body?{body:options.body}:{})}));
  statuses.push(response.status);return response;
 };
 await h.client.poll();await h.client.poll();
 assert.equal(h.client.read().state.phase,'reveal',`Real API responses: ${statuses.join(', ')}`);
});

for(const status of [401,404])test(`heartbeat ${status} still resets the stale session without a follow-up GET`,async()=>{
 const h=clientHarness(clientState());h.sandbox.Date={now:()=>100000};
 h.sandbox.fetch=async(path,options)=>{h.requests.push({path,method:options.method});return {ok:false,status,json:async()=>({error:'Synthetic rejection'})};};
 await h.client.poll();
 assert.equal(h.client.read().state,null);
 assert.equal(h.requests.length,1);
 assert.match(h.element('notice').textContent,status===401?/identity could not be restored/:/room has expired/);
});
for(const status of [429,503])test(`heartbeat ${status} keeps the session and retries without pretending presence succeeded`,async()=>{
 const initial=clientState(),h=clientHarness(initial);h.sandbox.Date={now:()=>100000};
 h.sandbox.fetch=async(path,options)=>{h.requests.push({path,method:options.method});return {ok:false,status,json:async()=>({error:'Synthetic temporary failure'})};};
 await h.client.poll();await h.client.poll();
 assert.equal(h.client.read().state.phase,'investigation');assert.equal(h.requests.length,2);
 assert.ok(h.requests.every(r=>r.method==='POST'));
 assert.match(h.element('notice').textContent,/Connection interrupted/);
});
test('recovering from heartbeat 400 still requires authorized GET state',async()=>{
 const h=clientHarness(clientState());h.sandbox.Date={now:()=>100000};
 h.sandbox.fetch=async(path,options)=>{h.requests.push({path,method:options.method});return {ok:false,status:options.method==='POST'?400:401,json:async()=>({error:'Synthetic rejection'})};};
 await h.client.poll();assert.equal(h.client.read().state,null);
 assert.deepEqual(h.requests.map(r=>r.method),['POST','GET']);
 assert.match(h.element('notice').textContent,/identity could not be restored/);
});
test('network failure during heartbeat does not discard identity or skip retry',async()=>{
 const h=clientHarness(clientState());h.sandbox.Date={now:()=>100000};
 h.sandbox.fetch=async(path,options)=>{h.requests.push({path,method:options.method});throw new Error('Synthetic network interruption');};
 await h.client.poll();await h.client.poll();
 assert.equal(h.client.read().state.phase,'investigation');assert.equal(h.requests.length,2);
 assert.ok(h.requests.every(r=>r.method==='POST'));
 assert.match(h.element('notice').textContent,/Connection interrupted/);
});
