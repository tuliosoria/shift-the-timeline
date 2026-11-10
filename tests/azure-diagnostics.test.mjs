import test from 'node:test';
import assert from 'node:assert/strict';
import {startupStep,startupDiagnostic,reportStartupFailure} from '../server/azure/diagnostics.mjs';
import {createAzureRuntime} from '../server/azure/runtime.mjs';
const env={SHIFT_RUNTIME:'azure',NODE_ENV:'production',SHIFT_ORIGIN:'https://shift.example',SHIFT_PG_HOST:'shift.postgres.database.azure.com',SHIFT_PG_USER:'shift_app',SHIFT_PG_DATABASE:'shift',SHIFT_CASE_FILE:'/private/case.json',SHIFT_CASE_SHA256:'a'.repeat(64)};
test('diagnostics never log arbitrary error text stack cause name code or embedded secret',async()=>{
 const secret='synthetic-DO-NOT-LOG-credential',error=Object.assign(new Error(secret),{code:secret,name:secret,stage:secret,cause:{token:secret},response:{secret}});error.toJSON=()=>({secret});
 await assert.rejects(()=>startupStep('database',()=>{throw error;}));const logs=[];reportStartupFailure(error,line=>logs.push(line));assert.equal(logs.length,1);assert.equal(logs[0],'{"event":"azure_startup_failed","stage":"database","reason":"unknown"}');assert.ok(!logs.join('').includes(secret));
 assert.deepEqual(startupDiagnostic(secret,secret),{event:'azure_startup_failed',stage:'runtime',reason:'unknown'});
 const getter={get code(){throw new Error(secret);}};assert.equal(startupDiagnostic(getter).reason,'unknown');
});
test('only whitelisted error codes become fixed diagnostic labels',()=>{for(const [code,reason] of [['28P01','database_authentication'],['42501','database_permission'],['42P01','database_schema_missing'],['42703','database_schema_mismatch'],['ENOTFOUND','dns'],['ETIMEDOUT','connection_timeout'],['ERR_TLS_CERT_ALTNAME_INVALID','tls_hostname'],['ENOENT','file_missing'],['SHIFT_CASE_INTEGRITY','case_integrity'],['EADDRINUSE','port_in_use']])assert.equal(startupDiagnostic({code,message:'private'}).reason,reason);});
test('inner token failure is not misclassified by outer PostgreSQL readiness step',async()=>{const error=Object.assign(new Error('private identity response'),{code:'ETIMEDOUT'});await assert.rejects(()=>startupStep('database',()=>startupStep('token',()=>{throw error;})));assert.deepEqual(startupDiagnostic(error),{event:'azure_startup_failed',stage:'token',reason:'connection_timeout'});});
test('runtime marks config database and case startup failures separately',async()=>{
 try{await createAzureRuntime({env:{}});assert.fail('expected failure');}catch(error){assert.equal(startupDiagnostic(error).stage,'config');}
 const store={checkReady:async()=>{throw Object.assign(new Error('secret DB connection'),{code:'28P01'});},cleanupExpired:async()=>0};
 try{await createAzureRuntime({env,store});assert.fail('expected failure');}catch(error){assert.deepEqual(startupDiagnostic(error),{event:'azure_startup_failed',stage:'database',reason:'database_authentication'});}
 store.checkReady=async()=>true;
 try{await createAzureRuntime({env,store,loadCaseImpl:async()=>{throw Object.assign(new Error('private case contents'),{code:'ENOENT'});}});assert.fail('expected failure');}catch(error){assert.deepEqual(startupDiagnostic(error),{event:'azure_startup_failed',stage:'case',reason:'file_missing'});}
});
