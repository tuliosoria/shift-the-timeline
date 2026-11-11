// Mechanical scope/envelope checks, NOT a semantic guarantee about model answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvider} from '../server/ai/provider.mjs';
const body=(parsed,usage={input_tokens:100,output_tokens:10})=>new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(parsed)}]}],usage}));
const ctx={instructions:'Be the suspect.',input:'{"question":"Where were you?"}',allowedIds:['x'],solution:'MUST NOT SEND'};
const make=(fn)=>createProvider({model:'synthetic-model',getSecret:async()=>'synthetic-test-only',fetchImpl:fn});
test('sends scoped instructions and input with strict reply+unlocked schema and parses the result',async()=>{
 let payload;const provider=make(async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return body({reply:'I was in the foyer.',unlocked:['x']});});
 const r=await provider(ctx);assert.deepEqual(r,{reply:'I was in the foyer.',unlocked:['x'],inputTokens:100,outputTokens:10});
 assert.deepEqual(payload.input,[{role:'developer',content:ctx.instructions},{role:'user',content:ctx.input}]);assert.ok(!JSON.stringify(payload).includes('MUST NOT SEND'));
 assert.equal(payload.store,false);assert.equal(payload.model,'synthetic-model');assert.equal(payload.max_output_tokens,1024);assert.equal(payload.service_tier,'default');assert.deepEqual(payload.prompt_cache_options,{mode:'explicit'});
 assert.equal(payload.text.format.strict,true);assert.deepEqual(payload.text.format.schema.required,['reply','unlocked']);assert.equal(payload.text.format.schema.additionalProperties,false);
});
test('rejects extra keys',async()=>{await assert.rejects(make(async()=>body({reply:'Hi.',unlocked:[],extra:1}))(ctx),/Invalid provider output/);});
test('rejects 4 unlocked',async()=>{await assert.rejects(make(async()=>body({reply:'Hi.',unlocked:['a','b','c','d']}))(ctx),/Invalid provider output/);});
test('rejects oversize reply and usage outside the 6000/1024 envelope',async()=>{
 await assert.rejects(make(async()=>body({reply:'x'.repeat(1201),unlocked:[]}))(ctx),/Invalid provider output/);
 await assert.rejects(make(async()=>body({reply:'Hi.',unlocked:[]},{input_tokens:6001,output_tokens:10}))(ctx),/usage/);
 await assert.rejects(make(async()=>body({reply:'Hi.',unlocked:[]},{input_tokens:10,output_tokens:1025}))(ctx),/usage/);
 assert.equal((await make(async()=>body({reply:'Hi.',unlocked:[]},{input_tokens:6000,output_tokens:1024}))(ctx)).inputTokens,6000);
});
test('rejects context over the byte ceiling',async()=>{await assert.rejects(make(async()=>assert.fail('no call'))({...ctx,input:'x'.repeat(20001)}),/envelope/);});
