// Authored known-answer regression using actual API/game/jobs/provider validation.
// Memory storage + deterministic mocked HTTP only. Not blind solving or model evaluation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAzureRuntime} from '../server/azure/runtime.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {buildChatContext} from '../server/ai/chat-context.mjs';
import {sourcesFor} from '../server/deductions.mjs';
import {PROPOSED_LIMITS} from '../server/ai/budget.mjs';
import {inferTopic} from '../public/question-topics.js';
import {caseData,catalog} from '../examples/public-demo.mjs';
import {publicDemoAttacks,syntheticProviderResponse} from './helpers/public-demo-adversarial.mjs';
const origin='https://synthetic-shift.example';
const env={SHIFT_RUNTIME:'azure',NODE_ENV:'production',SHIFT_ORIGIN:origin,SHIFT_PG_HOST:'synthetic.postgres.database.azure.com',SHIFT_PG_USER:'shift_app',SHIFT_PG_DATABASE:'shift',SHIFT_CASE_FILE:'/synthetic/case.json',SHIFT_CASE_SHA256:'0'.repeat(64),SHIFT_ALLOW_NEW_ROOMS:'true',SHIFT_AI_ENABLED:'true',SHIFT_AI_OPERATOR_CONSENT:'true',OPENAI_API_KEY:'synthetic-key-never-transmitted',SHIFT_AI_POLICY:JSON.stringify({...PROPOSED_LIMITS,model:'synthetic-model',inputRate:0.4,outputRate:1.6})};

test('three-player public-demo campaign answers every adversarial question privately through four turns and reveal',{skip:'pending Task 5 content: the public demo has no suspect briefs or deductions yet'},async()=>{
 const attacks=publicDemoAttacks(caseData.suspects.find(s=>s.id===caseData.culpritId).name);
 const originalFetch=globalThis.fetch;let escaped=0;globalThis.fetch=async()=>{escaped++;throw new Error('External network forbidden');};
 const store=Object.assign(new MemoryStore(),{checkReady:async()=>true,cleanupExpired:async()=>0});
 let serial=0,expected;const calls=[];const id=()=>`public-campaign-${++serial}`;
 const runtime=await createAzureRuntime({env,store,loadCaseImpl:async()=>validateCase({caseData,catalog}),fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);
  assert.deepEqual(payload.input.map(x=>x.role),['developer','user']);assert.equal(payload.input[0].content,expected.context.instructions);assert.equal(payload.input[1].content,expected.context.input);
  assert.equal(payload.store,false);assert.equal(payload.service_tier,'default');assert.deepEqual(payload.prompt_cache_options,{mode:'explicit'});assert.equal(payload.max_output_tokens,PROPOSED_LIMITS.outputTokens);
  assert.equal(options.body.includes(env.OPENAI_API_KEY),false);assert.equal(options.body.includes(caseData.solution.plan),false);
  for(const other of caseData.suspects)if(other.id!==expected.suspectId)assert.equal(options.body.includes(other.brief),false);
  calls.push(expected.sample.name);return syntheticProviderResponse(expected.sample,expected.unlocked);
 }});
 const post=async(path,body,cookie='')=>{const r=await runtime.api(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)}));assert.ok([200,201].includes(r.status),`${path}: ${r.status}`);return {body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const get=async(code,cookie)=>{const r=await runtime.api(new Request(`${origin}/api/rooms/${code}`,{headers:{cookie}}));assert.equal(r.status,200);return r.json();};
 try{
  const cookies=[];for(let p=0;p<3;p++)cookies.push((await post('/api/session',{})).cookie);
  const created=await post('/api/rooms',{name:'Host',caseId:caseData.id,id:id()},cookies[0]),code=created.body.code;
  for(let p=1;p<3;p++)await post(`/api/rooms/${code}/join`,{name:`Agent ${p}`,id:id()},cookies[p]);
  const act=(p,command)=>post(`/api/rooms/${code}/actions`,{id:id(),...command},cookies[p]);
  await act(0,{type:'start'});
  const unlockedBy=[new Set(),new Set(),new Set()],acceptedReplies=[];let questions=0;
  for(let round=1;round<=4;round++){
   for(let p=0;p<3;p++){
    const suspect=caseData.suspects[((round-1)*3+p)%caseData.suspects.length],allowed=[...sourcesFor(caseData,suspect.id)];
    const foreign=(caseData.deductions??[]).map(d=>d.id).find(x=>!allowed.includes(x));
    await act(p,{type:'select',round,suspectId:suspect.id});const history=[];
    for(let q=0;q<3;q++){
     // Each reply is made unique so a peer's own transcript can never be mistaken for a leak.
     const attack=attacks[questions%attacks.length],sample={...attack,reply:`${attack.reply} [question ${questions+1}]`},command={type:'ask',round,question:sample.question,id:id()};
     const [first,replay]=await Promise.all([act(p,command),act(p,command)]);assert.equal(first.body.version,replay.body.version);questions++;
     const message=first.body.me.interviews.find(i=>i.round===round).messages[q];assert.equal(message.status,'pending');
     const job=[...store.ai.values()].find(x=>x.kind==='job'&&x.messageId===message.id);assert.ok(job);
     expected={sample,suspectId:suspect.id,unlocked:[allowed[0],'forged-deduction-id',foreign].filter(Boolean),context:{...buildChatContext({caseData,suspectId:suspect.id,history,question:sample.question}),allowedIds:allowed}};
     assert.deepEqual(job.context,expected.context);await runtime.tick();
     const mine=await get(code,cookies[p]),updated=mine.me.interviews.find(i=>i.round===round).messages[q];
     if(sample.fallback){assert.equal(updated.status,'canonical');assert.equal(updated.reply,suspect.responses[inferTopic(sample.question)]);}
     else{assert.equal(updated.status,'complete');assert.equal(updated.reply,sample.reply);acceptedReplies.push(sample.reply);
      const fresh=allowed.slice(0,1).filter(x=>!unlockedBy[p].has(x));assert.deepEqual(updated.unlocked,fresh);fresh.forEach(x=>unlockedBy[p].add(x));}
     if(sample.fallback)updated.unlocked.forEach(x=>unlockedBy[p].add(x));
     assert.deepEqual(new Set(mine.me.deductions.map(d=>d.id)),unlockedBy[p]);
     history.push({question:sample.question,reply:updated.reply});
     for(let peer=0;peer<3;peer++)if(peer!==p){const view=await get(code,cookies[peer]);if(!sample.fallback)assert.equal(JSON.stringify(view).includes(sample.reply),false);assert.equal(view.me.interviews.some(i=>i.messages.some(m=>m.id===message.id)),false);assert.deepEqual(new Set(view.me.deductions.map(d=>d.id)),unlockedBy[peer]);assert.equal('result' in view,false);}
    }
   }
   const view=await get(code,cookies[0]);if(round<4)assert.equal(view.round,round+1);else assert.equal(view.phase,'accusation');
  }
  for(const cookie of cookies){const view=await get(code,cookie);assert.equal(view.me.interviews.length,4);assert.equal(view.me.interviews.flatMap(i=>i.messages).length,12);assert.ok(view.me.interviews.flatMap(i=>i.messages).every(m=>m.status!=='pending'));}
  // Known-answer votes deliberately test reveal mechanics, not human deduction.
  for(let p=0;p<3;p++)await act(p,{type:'vote',suspectId:caseData.culpritId});
  for(const cookie of cookies){const view=await get(code,cookie);assert.equal(view.phase,'reveal');assert.equal(view.result.outcome,'complete');}
  assert.equal(questions,36);assert.equal(calls.length,36);assert.deepEqual(new Set(calls),new Set(attacks.map(x=>x.name)));assert.equal(escaped,0);
  assert.ok(acceptedReplies.some(x=>x.startsWith('SYNTHETIC SPOILER')),'Explicit limitation: schema-valid spoiler replies are accepted privately, not semantically prevented.');
 }finally{await runtime.stop();globalThis.fetch=originalFetch;}
});
