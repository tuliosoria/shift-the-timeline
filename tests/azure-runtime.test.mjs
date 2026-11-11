import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readAzureConfig} from '../server/azure/config.mjs';
import {createAzureRuntime,readPinnedCase} from '../server/azure/runtime.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {PROPOSED_LIMITS} from '../server/ai/budget.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
const env={SHIFT_RUNTIME:'azure',NODE_ENV:'production',SHIFT_ORIGIN:'https://shift.example',SHIFT_PG_HOST:'shift.postgres.database.azure.com',SHIFT_PG_USER:'shift_app',SHIFT_PG_DATABASE:'shift',SHIFT_CASE_FILE:'/private/case.json',SHIFT_CASE_SHA256:'a'.repeat(64)};
const policy={...PROPOSED_LIMITS,model:'synthetic-model',inputRate:0.4,outputRate:1.6};
const ready=()=>Object.assign(new MemoryStore(),{checkReady:async()=>true,cleanupExpired:async()=>0});
const request=(path,body,headers={})=>new Request(`${env.SHIFT_ORIGIN}${path}`,body===undefined?{}:{method:'POST',headers:{origin:env.SHIFT_ORIGIN,'content-type':'application/json',...headers},body:JSON.stringify(body)});
const setup=(changes={},store=ready(),fetchImpl=()=>{throw new Error('Unexpected provider call');})=>createAzureRuntime({env:{...env,...changes},store,loadCaseImpl:async()=>validateCase({caseData:TRAIN_CASE,catalog:CASES}),fetchImpl});
test('Azure config is explicit strict and AI remains off with only a key',()=>{
 assert.equal(readAzureConfig({...env,OPENAI_API_KEY:'synthetic-not-a-secret'}).policy,null);assert.equal(readAzureConfig(env).allowNewRooms,false);
 for(const patch of [{SHIFT_RUNTIME:'aws'},{NODE_ENV:'development'},{SHIFT_ORIGIN:'http://shift.example'},{SHIFT_ORIGIN:'https://shift.example/path'},{SHIFT_PG_HOST:'attacker.example'},{SHIFT_CASE_SHA256:'bad'},{SHIFT_ALLOW_NEW_ROOMS:'yes'},{SHIFT_TABLE:'legacy'},{SHIFT_AI_ENABLED:'true'},{SHIFT_AI_ENABLED:'true',SHIFT_AI_OPERATOR_CONSENT:'true',OPENAI_API_KEY:'synthetic',SHIFT_AI_POLICY:JSON.stringify({...policy,maxConcurrent:999})}])assert.throws(()=>readAzureConfig({...env,...patch}),/Invalid Azure/);
 assert.ok(readAzureConfig({...env,SHIFT_AI_ENABLED:'true',SHIFT_AI_OPERATOR_CONSENT:'true',OPENAI_API_KEY:'synthetic',SHIFT_AI_POLICY:JSON.stringify(policy)}).policy);
});
test('pinned case accepts only hash-matched validated JSON',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shift-case-'));try{const file=join(dir,'case.json');const bytes=JSON.stringify({caseData:TRAIN_CASE,catalog:CASES});await writeFile(file,bytes);const config={caseFile:file,caseHash:createHash('sha256').update(bytes).digest('hex')};assert.equal((await readPinnedCase(config)).caseData.id,'demo');await assert.rejects(()=>readPinnedCase({...config,caseHash:'0'.repeat(64)}),/integrity/);await writeFile(file,'export const x=1;');await assert.rejects(()=>readPinnedCase({...config,caseHash:createHash('sha256').update('export const x=1;').digest('hex')}),SyntaxError);await writeFile(file,'x'.repeat(200001));await assert.rejects(()=>readPinnedCase(config),/unavailable/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('startup requires database readiness before private case loading',async()=>{let loaded=false;const store=ready();store.checkReady=async()=>{throw new Error('offline');};await assert.rejects(()=>createAzureRuntime({env,store,loadCaseImpl:async()=>{loaded=true;}}),/offline/);assert.equal(loaded,false);await assert.rejects(()=>setup({},new MemoryStore()),/Durable/);});
test('health rechecks database, fails closed and hides error details',async()=>{const store=ready(),runtime=await setup({},store);assert.equal((await runtime.api(request('/healthz'))).status,200);store.checkReady=async()=>{throw new Error('private database details');};const response=await runtime.api(request('/healthz'));assert.equal(response.status,503);assert.equal(await response.text(),'unavailable');assert.equal((await runtime.api(request('/healthz',{}))).status,405);await runtime.stop();});
test('room admission is paused by default and cookies/origin remain secure',async()=>{
 const runtime=await setup();const response=await runtime.api(request('/api/session',{}));assert.equal(response.status,201);const cookie=response.headers.get('set-cookie');assert.match(cookie,/__Host-shift_session=/);for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/'])assert.ok(cookie.includes(flag));
 assert.equal((await runtime.api(request('/api/rooms',{name:'Arthur',caseId:'demo',requestId:'abcdefgh'},{cookie}))).status,503);
 assert.equal((await runtime.api(request('/api/session',{}, {origin:'https://evil.example'}))).status,403);assert.equal((await runtime.api(request('/api/session',{}, {'sec-fetch-site':'cross-site'}))).status,403);
 const cases=await (await runtime.api(request('/api/cases'))).json();assert.equal(cases.dialogueMode,'canonical');assert.equal(cases.persistence,'durable');assert.ok(!JSON.stringify(cases).includes('culpritId'));assert.deepEqual(await runtime.tick(),{status:'disabled'});await runtime.stop();
});
test('AI requires explicit operator opt-in and never calls provider for empty queue',async()=>{let calls=0;const runtime=await setup({SHIFT_AI_ENABLED:'true',SHIFT_AI_OPERATOR_CONSENT:'true',OPENAI_API_KEY:'synthetic',SHIFT_AI_POLICY:JSON.stringify(policy)},ready(),()=>{calls++;throw new Error('No calls expected');});assert.equal((await (await runtime.api(request('/api/cases'))).json()).dialogueMode,'optional-openai');await runtime.tick();assert.equal(calls,0);await runtime.stop();});
test('bounded TTL maintenance runs even when AI disabled and stops cleanly',async()=>{const store=ready();let calls=0;store.cleanupExpired=async(now,limit)=>{assert.ok(Number.isSafeInteger(now));assert.equal(limit,500);calls++;return 3;};const runtime=await setup({},store);assert.equal(await runtime.maintain(),3);runtime.start();runtime.start();await runtime.stop();assert.equal(await runtime.maintain(),0);assert.equal(calls,1);assert.throws(()=>runtime.start(),/stopped/);});
test('explicit room admission supports durable create and idempotent retries without AI',async()=>{
 const store=ready(),runtime=await setup({SHIFT_ALLOW_NEW_ROOMS:'true',OPENAI_API_KEY:'synthetic-unused'},store);
 const session=await runtime.api(request('/api/session',{})),cookie=session.headers.get('set-cookie').split(';')[0];
 const body={name:'Arthur',caseId:'demo',requestId:'azure-create-0001'};
 const first=await runtime.api(request('/api/rooms',body,{cookie}));assert.equal(first.status,201);const result=await first.json();
 const retry=await runtime.api(request('/api/rooms',body,{cookie}));assert.equal(retry.status,201);assert.deepEqual(await retry.json(),result);assert.equal(store.rooms.size,1);assert.equal(store.ai.size,0);await runtime.stop();
});
