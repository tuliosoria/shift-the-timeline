import test from 'node:test';import assert from 'node:assert/strict';import {MemoryStore} from '../server/storage/memory.mjs';import {DurableGame} from '../server/persistent-game.mjs';import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
const apiImpl=await import('../server/api.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});const sessionImpl=await import('../server/sessions.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
let seq=0;const id=()=>`api-request-${++seq}-xxxxxxxx`;
function harness(){assert.equal(typeof apiImpl.createApi,'function');const store=new MemoryStore();const sessions=new sessionImpl.Sessions({store,secure:true});const game=new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES});const api=apiImpl.createApi({game,sessions,allowedOrigin:'https://shift.example',rateLimit:async()=>true});return {api,async call(path,body,cookie,extra={}){const response=await api(new Request('https://shift.example'+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin:'https://shift.example'}:{}),...(cookie?{cookie}:{}),...extra.headers},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),...Object.fromEntries(Object.entries(extra).filter(([k])=>k!=='headers'))}));return {status:response.status,headers:response.headers,body:response.status===204?null:await response.json()};}};}
test('HTTP cookie clients complete a game and reveal no foreign transcript or token',async()=>{const {call}=harness();const players=[];for(let i=0;i<3;i++)players.push((await call('/api/session',{})).headers.get('set-cookie').split(';')[0]);const a=await call('/api/rooms',{name:'A',caseId:'demo',id:id()},players[0]);assert.equal(a.status,201);assert.equal(a.body.token,undefined);const code=a.body.code;for(let i=1;i<3;i++)assert.equal((await call(`/api/rooms/${code}/join`,{name:`P${i}`,id:id()},players[i])).status,200);const act=async(p,type,rest={})=>{const r=await call(`/api/rooms/${code}/actions`,{id:id(),type,...rest},p);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};await act(players[0],'start');for(let round=1;round<=4;round++)for(const p of players){await act(p,'select',{round,suspectId:'suspect-1'});for(let n=0;n<3;n++)await act(p,'ask',{round,question:'Private question'});}for(const p of players)await act(p,'vote',{suspectId:'suspect-0'});const final=await call(`/api/rooms/${code}`,null,players[0]);assert.equal(final.body.result.outcome,'complete');assert.equal(final.body.me.interviews.length,4);assert.ok(final.body.players.every(p=>!('token' in p)&&!('interviews' in p)));assert.equal((await call(`/api/rooms/${code}?since=${final.body.version}`,null,players[0])).status,204);});
test('HTTP rejects CSRF, malformed requests, unauthenticated access and direct origin bypass',async()=>{const {call}=harness();assert.equal((await call('/api/rooms',{name:'A',caseId:'demo',id:id()})).status,401);assert.equal((await call('/api/session',{},null,{headers:{origin:'https://evil.example'}})).status,403);assert.equal((await call('/api/session',{},null,{headers:{origin:''}})).status,403);assert.equal((await call('/api/session','x'.repeat(9000))).status,413);assert.equal((await call('/api/session','{')).status,400);assert.equal((await call('/api/session','{}',null,{headers:{'content-type':'text/plain'}})).status,415);assert.equal((await call('/api/session',null,null,{method:'DELETE'})).status,405);for(const path of ['/server/game.mjs','/private/train-case.mjs','/.env'])assert.equal((await call(path)).status,404);const boot=await call('/api/session',{});assert.match(boot.headers.get('cache-control'),/no-store/);const cookie=boot.headers.get('set-cookie').split(';')[0];assert.equal((await call('/api/session/logout',{},cookie)).status,200);assert.equal((await call('/api/rooms',{name:'A',caseId:'demo',id:id()},cookie)).status,401);});
test('mobile video requests support bounded, open and suffix byte ranges and HEAD',async t=>{
 const {createServer}=await import('../server/http.mjs');
 const server=createServer({origin:'http://127.0.0.1',api:async()=>new Response(null,{status:404})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}/assets/films/train.mp4`;
 const full=await fetch(url);assert.equal(full.status,200);
 const bytes=Buffer.from(await full.arrayBuffer());
 assert.equal(full.headers.get('content-type'),'video/mp4');
 assert.equal(full.headers.get('accept-ranges'),'bytes');
 for(const [range,start,end]of [['bytes=0-1',0,1],['bytes=20-39',20,39],['bytes=-8',bytes.length-8,bytes.length-1],[`bytes=${bytes.length-4}-`,bytes.length-4,bytes.length-1],['bytes=0-999999999',0,bytes.length-1]]){
  const r=await fetch(url,{headers:{Range:range}});
  assert.equal(r.status,206,range);
  assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
  assert.equal(Number(r.headers.get('content-length')),end-start+1);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(start,end+1));
 }
 for(const range of [`bytes=${bytes.length}-`,'bytes=20-10','bytes=-0','bytes=abc','bytes=0-1,3-4']){
  const r=await fetch(url,{headers:{Range:range}});assert.equal(r.status,416,range);
  assert.equal(r.headers.get('content-range'),`bytes */${bytes.length}`);assert.equal((await r.arrayBuffer()).byteLength,0);
 }
 const head=await fetch(url,{method:'HEAD',headers:{Range:'bytes=0-1'}});
 assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),bytes.length);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal((await fetch(url.replace('train.mp4','private.mp4'))).status,404);
});
