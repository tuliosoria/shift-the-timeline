// Authored known-answer regression using actual API/game/jobs/provider validation.
// Memory storage + deterministic mocked HTTP only. Not blind solving or model evaluation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAzureRuntime} from '../server/azure/runtime.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {caseData,catalog,reviewRoutes} from '../examples/public-demo.mjs';
import {publicDemoAttacks,syntheticProviderResponse} from './helpers/public-demo-adversarial.mjs';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
const origin='https://synthetic-shift.example';
const env={SHIFT_RUNTIME:'azure',NODE_ENV:'production',SHIFT_ORIGIN:origin,SHIFT_PG_HOST:'synthetic.postgres.database.azure.com',SHIFT_PG_USER:'shift_app',SHIFT_PG_DATABASE:'shift',SHIFT_CASE_FILE:'/synthetic/case.json',SHIFT_CASE_SHA256:'0'.repeat(64),SHIFT_ALLOW_NEW_ROOMS:'true',SHIFT_AI_ENABLED:'true',SHIFT_AI_OPERATOR_CONSENT:'true',OPENAI_API_KEY:'synthetic-key-never-transmitted',SHIFT_AI_POLICY:JSON.stringify({model:'synthetic-model',inputRate:1,outputRate:4,inputTokens:2500,outputTokens:350,maxConcurrent:2,uncapped:true,roomMicroUsd:null,dayMicroUsd:null,monthMicroUsd:null})};

test('three-player public-demo campaign keeps mixed-consent adversarial AI separate through three rounds and reveal',async()=>{
 const attacks=publicDemoAttacks(caseData.suspects.find(s=>s.id===caseData.culpritId).name);
 const originalFetch=globalThis.fetch;let escaped=0;globalThis.fetch=async()=>{escaped++;throw new Error('External network forbidden');};
 const store=Object.assign(new MemoryStore(),{checkReady:async()=>true,cleanupExpired:async()=>0});
 let serial=0,expectedSample,expectedContext;const calls=[];const id=()=>`public-campaign-${++serial}`;
 const runtime=await createAzureRuntime({env,store,loadCaseImpl:async()=>validateCase({caseData,catalog}),fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);
  assert.deepEqual(JSON.parse(payload.input[1].content),expectedContext);assert.deepEqual(payload.input.map(x=>x.role),['developer','user']);
  assert.equal(payload.store,false);assert.equal(payload.service_tier,'default');assert.deepEqual(payload.prompt_cache_options,{mode:'explicit'});assert.equal(payload.max_output_tokens,350);
  assert.equal(options.body.includes(env.OPENAI_API_KEY),false);assert.equal(options.body.includes(caseData.solution.plan),false);
  calls.push(expectedSample.name);return syntheticProviderResponse(expectedSample);
 }});
 const post=async(path,body,cookie='')=>{const r=await runtime.api(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)}));assert.ok([200,201].includes(r.status),`${path}: ${r.status}`);return {body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const get=async(code,cookie)=>{const r=await runtime.api(new Request(`${origin}/api/rooms/${code}`,{headers:{cookie}}));assert.equal(r.status,200);return r.json();};
 try{
  const cookies=[];for(let p=0;p<3;p++)cookies.push((await post('/api/session',{})).cookie);
  const created=await post('/api/rooms',{name:'Host',caseId:caseData.id,id:id()},cookies[0]),code=created.body.code;
  for(let p=1;p<3;p++)await post(`/api/rooms/${code}/join`,{name:`Agent ${p}`,id:id()},cookies[p]);
  const act=(p,command)=>post(`/api/rooms/${code}/actions`,{id:id(),...command},cookies[p]);
  await act(0,{type:'start'});
  const route=reviewRoutes[1];assert.equal(route.interviews.length,4);
  const schedule=[route.interviews.slice(0,3),[route.interviews[3],{suspectId:'dev',topics:['clue']},{suspectId:'kit',topics:['clue']}],[{suspectId:'nell',topics:['clue']},{suspectId:'oscar',topics:['clue']},{suspectId:'wren',topics:['clue']}]];
  const shared=[],acceptedVoices=[];let aiCount=0,questions=0;
  for(let round=1;round<=3;round++){
   for(let p=0;p<3;p++){
    const selected=schedule[round-1][p],suspect=caseData.suspects.find(s=>s.id===selected.suspectId),topic=selected.topics[0];
    await act(p,{type:'select',round,suspectId:suspect.id});
    const consent=round===1?(p===0?true:p===1?false:'true'):round===3&&p===2?false:true;
    const sample=attacks[aiCount%attacks.length],canonical=suspect.responses[topic],requestId=id();
    const command={type:'ask',round,topic,question:sample.question,aiConsent:consent,id:requestId};
    const [first,replay]=await Promise.all([act(p,command),act(p,command)]);assert.equal(first.body.version,replay.body.version);questions++;
    const message=first.body.me.interviews.find(i=>i.round===round).messages[0];assert.equal(message.answer,canonical);
    if(consent===true){
     assert.equal(message.narration.status,'pending');const job=[...store.ai.values()].find(x=>x.kind==='job'&&x.messageId===message.id);assert.ok(job);
     expectedSample=sample;expectedContext={persona:`${suspect.name}. ${suspect.role}. ${suspect.profile}`,canonical,question:sample.question};
     assert.deepEqual(job.context,expectedContext);await runtime.tick();aiCount++;
     const updated=(await get(code,cookies[p])).me.interviews.find(i=>i.round===round).messages[0];assert.equal(updated.answer,canonical);
     assert.equal(updated.narration.status,sample.fallback?'fallback':'complete');
     if(!sample.fallback){assert.equal(updated.narration.text,sample.voice);acceptedVoices.push(sample.voice);
      const rendered=clientHarness(clientState()).client.renderNarration(updated);assert.match(rendered,/AI VOICE · NOT EVIDENCE/);assert.equal(rendered.includes('<script>'),false);assert.equal(rendered.includes('<img'),false);
     }
    }else{assert.equal(message.narration,undefined);const before=calls.length;await runtime.tick();assert.equal(calls.length,before);}
    for(let peer=0;peer<3;peer++)if(peer!==p){const view=await get(code,cookies[peer]);if(consent===true)assert.equal(JSON.stringify(view).includes(sample.voice),false);assert.equal(view.me.interviews.some(i=>i.messages.some(m=>m.id===message.id)),false);}
    await act(p,{type:'share',messageId:message.id});shared.push(canonical);
    for(const cookie of cookies){const view=await get(code,cookie);assert.deepEqual(view.board.map(x=>x.text),shared);for(const voice of acceptedVoices)assert.equal(JSON.stringify(view.board).includes(voice),false);assert.equal('result' in view,false);}
   }
   for(let p=0;p<2;p++){await act(p,{type:'end',round});assert.equal((await get(code,cookies[0])).round,round);}
   await act(2,{type:'end',round});
  }
  for(const cookie of cookies){const view=await get(code,cookie);assert.equal(view.phase,'accusation');assert.equal(view.me.interviews.length,3);assert.equal(view.me.interviews.flatMap(i=>i.messages).length,3);assert.equal('result' in view,false);}
  // Known-answer votes deliberately test reveal mechanics, not human deduction.
  for(let p=0;p<3;p++)await act(p,{type:'vote',suspectId:caseData.culpritId});
  for(const cookie of cookies){const view=await get(code,cookie);assert.equal(view.phase,'reveal');assert.equal(view.result.outcome,'complete');assert.deepEqual(view.board.map(x=>x.text),shared);}
  assert.equal(questions,9);assert.equal(aiCount,6);assert.equal(calls.length,6);assert.deepEqual(new Set(calls),new Set(attacks.map(x=>x.name)));assert.equal(escaped,0);
  assert.ok(acceptedVoices.some(x=>x.startsWith('SYNTHETIC SPOILER')),'Explicit limitation: schema-valid spoiler narration is accepted privately, not semantically prevented.');
 }finally{await runtime.stop();globalThis.fetch=originalFetch;}
});
