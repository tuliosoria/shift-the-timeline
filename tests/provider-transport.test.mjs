import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvider} from '../server/ai/provider.mjs';
const ctx={instructions:'Scoped instructions',input:'Scoped question',allowedIds:[]};
const envelope={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"reply":"A scoped reply.","unlocked":[]}'}]}],usage:{input_tokens:30,output_tokens:20}};
const provider=response=>createProvider({model:'synthetic-model',getSecret:async()=>'synthetic-test-only',fetchImpl:async()=>response});
const bytes=text=>new TextEncoder().encode(text);

test('rejects non-completed provider envelopes even when they contain parseable output',async()=>{
 for(const status of ['failed','cancelled','queued','in_progress','unknown',null]){
  await assert.rejects(provider(new Response(JSON.stringify({...envelope,status})))(ctx),/not completed/);
 }
 await assert.rejects(provider(new Response(JSON.stringify({...envelope,error:{message:'must not become dialogue'}})))(ctx),/not completed/);
 assert.equal((await provider(new Response(JSON.stringify(envelope)))(ctx)).reply,'A scoped reply.');
});

test('cancels over-limit streaming responses before consuming the remaining body',async()=>{
 let reads=0,cancelled=0;
 const response=new Response(new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(8193));},cancel(){cancelled++;}},{highWaterMark:0}));
 await assert.rejects(provider(response)(ctx),/too large/);
 assert.equal(reads,2);assert.equal(cancelled,1);
});

test('response ceiling counts UTF-8 bytes, accepts the exact boundary and rejects the next byte',async()=>{
 const raw=JSON.stringify(envelope),padding=16384-Buffer.byteLength(raw);
 assert.equal((await provider(new Response(raw+' '.repeat(padding)))(ctx)).reply,'A scoped reply.');
 await assert.rejects(provider(new Response(raw+' '.repeat(padding+1)))(ctx),/too large/);
 await assert.rejects(provider(new Response('é'.repeat(8193)))(ctx),/too large/);
});

test('decodes a multibyte character split across transport chunks',async()=>{
 const raw=bytes(JSON.stringify({...envelope,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'A café.',unlocked:[]})}]}]}));
 const at=raw.indexOf(0xc3)+1;
 const response=new Response(new ReadableStream({start(c){c.enqueue(raw.slice(0,at));c.enqueue(raw.slice(at));c.close();}}));
 assert.equal((await provider(response)(ctx)).reply,'A café.');
});

test('rejects malformed UTF-8 and read errors without returning partial dialogue',async()=>{
 await assert.rejects(provider(new Response(new Uint8Array([0xff])))(ctx));
 const response=new Response(new ReadableStream({pull(c){c.error(new Error('synthetic stream failure'));}}));
 await assert.rejects(provider(response)(ctx),/synthetic stream failure/);
});

test('cancels unsuccessful HTTP bodies without reading or retrying them',async()=>{
 let cancelled=0,calls=0,reads=0;
 const response=new Response(new ReadableStream({pull(c){reads++;c.enqueue(bytes('not dialogue'));},cancel(){cancelled++;}},{highWaterMark:0}),{status:503});
 const send=createProvider({model:'synthetic-model',getSecret:async()=>'synthetic-test-only',fetchImpl:async()=>{calls++;return response;}});
 await assert.rejects(send(ctx),/unsuccessful/);assert.equal(cancelled,1);assert.equal(reads,0);assert.equal(calls,1);
});

test('does not wait for a stalled upstream cancellation acknowledgement',async()=>{
 let cancelled=false;
 const response=new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(16385));},cancel(){cancelled=true;return new Promise(()=>{});}},{highWaterMark:0}));
 await assert.rejects(provider(response)(ctx),/too large/);assert.equal(cancelled,true);
});
