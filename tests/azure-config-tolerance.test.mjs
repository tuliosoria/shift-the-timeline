import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readAzureConfig} from '../server/azure/config.mjs';
import {createAzureRuntime,readPinnedCase} from '../server/azure/runtime.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
const env={SHIFT_RUNTIME:'azure',NODE_ENV:'production',SHIFT_ORIGIN:'https://shift.example',SHIFT_PG_HOST:'shift.postgres.database.azure.com',SHIFT_PG_USER:'shift_app',SHIFT_PG_DATABASE:'shift',SHIFT_CASE_FILE:'/private/case.json',SHIFT_CASE_SHA256:'a'.repeat(64)};
const ai={...env,SHIFT_AI_ENABLED:'true',SHIFT_AI_OPERATOR_CONSENT:'true',OPENAI_API_KEY:'synthetic-DO-NOT-LOG-key'};
const stale=JSON.stringify({model:'synthetic-DO-NOT-LOG-model',inputRate:0.4,outputRate:1.6,inputTokens:2500,outputTokens:350,roomMicroUsd:250000,dayMicroUsd:5000000,monthMicroUsd:25000000,maxConcurrent:2});
const ready=()=>Object.assign(new MemoryStore(),{checkReady:async()=>true,cleanupExpired:async()=>0});

test('a stale or invalid AI policy turns AI off instead of stopping the server',()=>{
 for(const policy of [stale,'{not json',JSON.stringify({model:'synthetic-model'}),undefined]){
  const config=readAzureConfig({...ai,SHIFT_AI_POLICY:policy});
  assert.equal(config.policy,null);assert.equal(config.aiPolicyRejected,true);
 }
 assert.equal(readAzureConfig(env).aiPolicyRejected,false);
 // Missing consent or key is still a hard configuration error.
 for(const patch of [{SHIFT_AI_OPERATOR_CONSENT:undefined},{OPENAI_API_KEY:undefined}])assert.throws(()=>readAzureConfig({...ai,SHIFT_AI_POLICY:stale,...patch}));
});
test('runtime with a stale policy starts canonical and logs only a fixed notice',async()=>{
 const logs=[];
 const runtime=await createAzureRuntime({env:{...ai,SHIFT_AI_POLICY:stale},store:ready(),loadCaseImpl:async()=>validateCase({caseData:TRAIN_CASE,catalog:CASES}),notice:line=>logs.push(line)});
 const cases=await (await runtime.api(new Request('https://shift.example/api/cases'))).json();
 assert.equal(cases.dialogueMode,'canonical');
 assert.deepEqual(logs,['{"event":"azure_startup_notice","reason":"ai_policy_invalid"}']);
 await runtime.stop();
});
test('a case pin superseded by the same package manifest is accepted with a notice; anything else is rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shift-pin-'));
 try{
  await mkdir(join(dir,'private'));const file=join(dir,'private','case.json'),bytes=JSON.stringify({caseData:TRAIN_CASE,catalog:CASES});await writeFile(file,bytes);
  const digest=createHash('sha256').update(bytes).digest('hex'),old='b'.repeat(64),logs=[],notice=line=>logs.push(line);
  // Exact pin: no notice.
  assert.equal((await readPinnedCase({caseFile:file,caseHash:digest},notice)).caseData.id,'demo');assert.deepEqual(logs,[]);
  // Old pin, no manifest: rejected.
  await assert.rejects(()=>readPinnedCase({caseFile:file,caseHash:old},notice),/integrity/);
  // Old pin, manifest for different bytes: rejected.
  await writeFile(join(dir,'case-manifest.json'),JSON.stringify({case:'public-demo',sha256:'c'.repeat(64)}));
  await assert.rejects(()=>readPinnedCase({caseFile:file,caseHash:old},notice),/integrity/);
  // Old pin, package manifest matching the bytes: accepted with a fixed notice.
  await writeFile(join(dir,'case-manifest.json'),JSON.stringify({case:'public-demo',sha256:digest}));
  assert.equal((await readPinnedCase({caseFile:file,caseHash:old},notice)).caseData.id,'demo');
  assert.deepEqual(logs,['{"event":"azure_startup_notice","reason":"case_pin_superseded"}']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
