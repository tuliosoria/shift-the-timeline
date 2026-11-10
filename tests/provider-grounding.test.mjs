// Mechanical scope/envelope checks, NOT a semantic guarantee about model answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvider} from '../server/ai/provider.mjs';
import {caseData} from '../examples/public-demo.mjs';
const reply=()=>new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({voice:'Synthetic grounded voice.'})}]}],usage:{input_tokens:100,output_tokens:10}}));
test('voice polish retains exact scoped context and operational/provider controls',async()=>{
 let payload;const provider=createProvider({model:'synthetic-model',getSecret:async()=>'synthetic-test-only',fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return reply();}});
 const context={persona:'Fictional technician',canonical:'I was in the foyer.',question:'Where were you?',history:'MUST NOT SEND',solution:'MUST NOT SEND',board:'MUST NOT SEND'};
 await provider(context);assert.deepEqual(JSON.parse(payload.input[1].content),{persona:context.persona,canonical:context.canonical,question:context.question});
 assert.equal(payload.input.length,2);assert.equal(payload.store,false);assert.equal(payload.model,'synthetic-model');assert.equal(payload.max_output_tokens,350);assert.equal(payload.service_tier,'default');assert.deepEqual(payload.prompt_cache_options,{mode:'explicit'});
 assert.equal(payload.text.format.strict,true);assert.deepEqual(payload.text.format.schema.required,['voice']);
 for(const instruction of ['only canonical for facts','unsupported premises or accusations','No history is supplied','Canonical evidence stays separate and unchanged'])assert.ok(payload.input[0].content.includes(instruction));
});
test('all public-demo canonical topics fit unchanged conservative envelope with maximal ASCII question',async()=>{
 let calls=0;const provider=createProvider({model:'synthetic-model',getSecret:async()=>'synthetic-test-only',fetchImpl:async(url,options)=>{calls++;assert.ok(Buffer.byteLength(JSON.stringify(JSON.parse(options.body).input))<=2000);return reply();}});
 for(const suspect of caseData.suspects)for(const canonical of Object.values(suspect.responses))await provider({persona:`${suspect.name}. ${suspect.role}. ${suspect.profile}`,canonical,question:'q'.repeat(300)});
 assert.equal(calls,caseData.suspects.length*4);
});
