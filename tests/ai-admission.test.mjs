import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,id,policy} from './helpers/ai.mjs';
import {createRuntime} from '../server/runtime.mjs';
import {PROPOSED_LIMITS} from '../server/ai/budget.mjs';
const env={NODE_ENV:'development',SHIFT_ORIGIN:'http://localhost:4188',SHIFT_CASE_FILE:'tests/fixtures/case.mjs'};
const completePolicy={...PROPOSED_LIMITS,...policy};
for(const consent of [undefined,false,'true',1,{}])test(`ask without literal consent does not admit AI: ${JSON.stringify(consent)}`,async()=>{
 const h=await harness();const action={type:'ask',round:1,topic:'clue',question:'A fictional question',id:id(),...(consent===undefined?{}:{aiConsent:consent})};
 await h.game.act(h.code,'session-A',action);assert.equal(h.jobList().length,0);assert.equal(h.store.ai.size,0);
 const m=(await h.game.view(h.code,'session-A')).me.interviews[0].messages[0];assert.ok(m.answer);assert.equal(m.narration,undefined);
});
test('consented ask admits one job and receipt binds the original consent',async()=>{
 const h=await harness(),action={type:'ask',round:1,topic:'clue',question:'A fictional question',id:id(),aiConsent:true};
 await h.game.act(h.code,'session-A',action);await h.game.act(h.code,'session-A',action);assert.equal(h.jobList().length,1);
 await assert.rejects(()=>h.game.act(h.code,'session-A',{...action,aiConsent:false}),e=>e.status===409);assert.equal(h.jobList().length,1);
});
test('disabled runtime ignores AI policy and advertises canonical capability',async()=>{
 const api=await createRuntime({...env,SHIFT_AI_ENABLED:'false',SHIFT_AI_POLICY:'broken'});
 const body=await (await api(new Request(`${env.SHIFT_ORIGIN}/api/cases`))).json();assert.equal(body.dialogueMode,'canonical');
});
test('explicitly enabled runtime advertises optional AI with valid complete policy',async()=>{
 const api=await createRuntime({...env,SHIFT_AI_ENABLED:'true',SHIFT_AI_POLICY:JSON.stringify(completePolicy)});
 const body=await (await api(new Request(`${env.SHIFT_ORIGIN}/api/cases`))).json();assert.equal(body.dialogueMode,'ai_optional');assert.ok(!JSON.stringify(body).includes(policy.model));
});
test('enabled runtime rejects missing, excessive and incomplete policy before credential access',async()=>{
 for(const p of ['', '{}',JSON.stringify({...completePolicy,dayMicroUsd:5000001}),JSON.stringify({...completePolicy,extra:true})])await assert.rejects(()=>createRuntime({...env,NODE_ENV:'production',SHIFT_ORIGIN:'https://shift.terminalufo.com',SHIFT_AI_ENABLED:'true',SHIFT_AI_POLICY:p}),/AI policy/);
});
