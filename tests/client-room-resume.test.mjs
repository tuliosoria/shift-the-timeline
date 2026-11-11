import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
const run=(h,s)=>vm.runInNewContext(s,h.sandbox);
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
function setup(name='',code='ABCDEFGH'){
 const s=clientState({phase:'lobby',round:0}),h=clientHarness(s);
 run(h,"session=null;state=null;lastVersion=-1;entryMode='join'");
 h.element('join-code').value=code;h.element('join-name').value=name;
 return {h,s,join:()=>run(h,'joinOrResume('+JSON.stringify({code,name})+')')};
}
test('known room restores original player with blank or different codename and no join mutation',async()=>{
 for(const name of ['','Different name']){const {h,s,join}=setup(name);h.sandbox.fetch=async(path,options)=>{h.requests.push({path,body:options.body});return response(s);};
 assert.equal(await join(),true);assert.equal(h.requests.length,1);assert.equal(h.requests[0].body,undefined);
 assert.equal(h.client.read().state.me.name,'Agent One');assert.deepEqual(JSON.parse(h.saved.get('shift-session')),{code:s.code,playerId:s.me.id});
 assert.equal(h.client.read().pending,null);assert.match(h.element('notice').textContent,/Reconnected as Agent One/);
 }
});
test('stranger lookup401 falls through to exactly one existing idempotent join',async()=>{
 const {h,s,join}=setup('New player');h.sandbox.fetch=async(path,options)=>{h.requests.push({path,body:options.body?JSON.parse(options.body):null});return options.body?response({code:s.code,playerId:s.me.id,state:s}):response({error:'Not a member'},401);};
 assert.equal(await join(),true);assert.equal(h.requests.length,2);assert.equal(h.requests[1].path,'/api/rooms/ABCDEFGH/join');assert.equal(h.requests[1].body.name,'New player');assert.ok(h.requests[1].body.id);assert.equal(h.client.read().pending,null);
});
test('unknown player needs a codename after authenticated lookup fails, with no empty join',async()=>{
 const {h,join}=setup();h.sandbox.fetch=async(path,options)=>{h.requests.push({path,body:options.body});return response({error:'Not a member'},401);};
 assert.equal(await join(),false);assert.equal(h.requests.length,1);assert.equal(run(h,'session'),null);assert.match(h.element('notice').textContent,/Enter a codename/);assert.equal(h.element('join-name').focused,true);
});
test('missing rooms, temporary failures and malformed snapshots never create membership or pending work',async()=>{
 for(const result of [()=>response({error:'Missing'},404),()=>response({error:'Unavailable'},503),()=>{throw Error('Offline');},()=>response({code:'OTHER234',me:{id:'other'}}),()=>response({code:'ABCDEFGH',me:{}})]){
 const {h,join}=setup('New player');h.sandbox.fetch=async(path,options)=>{h.requests.push({path,body:options.body});return result();};
 assert.equal(await join(),false);assert.equal(h.requests.length,1);assert.equal(h.client.read().pending,null);assert.equal(run(h,'session'),null);assert.equal(h.saved.has('shift-pending'),false);assert.equal(h.saved.has('shift-session'),false);assert.equal(h.client.read().busy,false);
 }
});
test('repeated submit cannot duplicate the membership lookup or join',async()=>{
 const {h,s,join}=setup();let release;h.sandbox.fetch=async()=>{h.requests.push({});return new Promise(r=>release=r);};const first=join();assert.equal(await join(),false);assert.equal(h.requests.length,1);release(response(s));assert.equal(await first,true);
});
test('newer form intent cancels both resume and fallback join after delayed lookup',async()=>{
 for(const mode of ['create','code','name'])for(const known of [true,false]){const {h,s,join}=setup('Agent');let release;h.sandbox.fetch=async()=>{h.requests.push({});return new Promise(r=>release=r);};const first=join();
 if(mode==='create')run(h,"entryMode='create'");else h.element(mode==='code'?'join-code':'join-name').value='Changed';
 release(known?response(s):response({error:'Not member'},401));assert.equal(await first,false);assert.equal(h.requests.length,1);assert.equal(run(h,'session'),null);assert.equal(h.client.read().pending,null);assert.equal(h.client.read().busy,false);
 }
});
test('an existing room or pending action blocks a fresh resume lookup',async()=>{
 for(const change of ["pending={entry:true}","session={code:'ABCDEFGH',playerId:'p1'}",'state=original']){const {h,s,join}=setup();h.sandbox.original=s;run(h,change);assert.equal(await join(),false);assert.equal(h.requests.length,0);}
});
test('an uncertain new join keeps its original request for safe retry after preflight',async()=>{
 const {h,s,join}=setup('New player');let joins=0;h.sandbox.fetch=async(path,options)=>{const body=options.body?JSON.parse(options.body):null;h.requests.push({path,body});if(!body)return response({error:'Not member'},401);if(!joins++)throw Error('Lost reply');return response({code:s.code,playerId:s.me.id,state:s});};
 assert.equal(await join(),false);const original=structuredClone(h.client.read().pending.body);assert.equal(await h.client.runPending(),true);assert.deepEqual(h.requests.slice(1).map(r=>r.body),[original,original]);assert.equal(h.requests.length,3);
});

import {randomUUID} from 'node:crypto';
import {MemoryStore} from '../server/storage/memory.mjs';
import {Sessions} from '../server/sessions.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {createApi} from '../server/api.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
test('real authenticated API resumes full rooms through every phase without roster, ballot or evidence mutation',async()=>{
 const store=new MemoryStore(),sessions=new Sessions({store,secure:false}),game=new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES});
 const identities=await Promise.all(Array.from({length:4},()=>sessions.create()));
 const created=await game.create(identities[0].hash,'Original agent','demo',randomUUID()),code=created.code;
 for(let i=1;i<4;i++)await game.join(code,identities[i].hash,`Peer ${i}`,randomUUID());
 const act=(i,type,data={})=>game.act(code,identities[i].hash,{id:randomUUID(),type,...data});
 const origin='http://resume.test',api=createApi({game,sessions,allowedOrigin:origin,rateLimit:async()=>{}});
 for(const phase of ['lobby','investigation','accusation','reveal']){
  if(phase==='investigation'){await act(0,'start');await act(0,'select',{round:1,suspectId:'suspect-1'});await act(0,'ask',{round:1,topic:'clue',question:'Private question'});}
  if(phase==='accusation'){for(let round=1;round<=3;round++)await act(0,'advance',{round,confirmed:true});await act(0,'vote',{suspectId:TRAIN_CASE.culpritId});}
  if(phase==='reveal')for(let i=1;i<4;i++)await act(i,'vote',{suspectId:TRAIN_CASE.culpritId});
  const before=await game.view(code,identities[0].hash),{h,join}=setup(phase==='lobby'?'Different name':'',code),methods=[];
  h.sandbox.fetch=async(path,options)=>{methods.push(options.method);return api(new Request(origin+path,{method:options.method,headers:{...options.headers,origin,cookie:identities[0].cookie.split(';')[0]},...(options.body?{body:options.body}:{})}));};
  assert.equal(await join(),true,phase);assert.deepEqual(methods,['GET']);
  assert.equal(h.client.read().state.me.id,created.playerId);assert.equal(h.client.read().state.me.name,'Original agent');assert.equal(h.client.read().state.phase,phase);
  assert.equal(JSON.stringify(h.client.read().state.me),JSON.stringify(before.me));assert.equal(h.client.read().state.players.length,4);
  assert.deepEqual(await game.view(code,identities[0].hash),before);assert.equal((await game.view(code,identities[1].hash)).me.interviews.length,0);
 }
});
test('expired authentication is not replaced or silently renewed by reconnection',async()=>{
 const {h,join}=setup('New player');h.sandbox.fetch=async(path,options)=>{h.requests.push({path,method:options.method});return response({error:'Session expired or ended.'},401);};
 assert.equal(await join(),false);assert.deepEqual(h.requests.map(r=>r.method),['GET','POST']);assert.ok(h.requests.every(r=>r.path.startsWith('/api/rooms/')));assert.equal(run(h,'session'),null);assert.equal(h.client.read().pending,null);assert.match(h.element('notice').textContent,/Session expired/);
});
