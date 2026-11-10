import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagedIdentityPool} from '../server/azure/database.mjs';
import {startupStep,startupDiagnostic,reportStartupFailure} from '../server/azure/diagnostics.mjs';
const config={host:'test.postgres.database.azure.com',database:'shift',user:'shift_app'};
function timers(){const scheduled=[],cancelled=[];return {scheduled,cancelled,schedule:(run,ms)=>{const handle={run,ms};scheduled.push(handle);return handle;},cancel:handle=>cancelled.push(handle)};}
test('MI token completes before pool construction; refresh callback stays bounded and TLS verified',async()=>{
 const t=timers(),events=[];let resolveToken,calls=0;
 const credential={getToken:async(scope,options)=>{calls++;events.push('token');assert.equal(scope,'https://ossrdbms-aad.database.windows.net/.default');assert.ok(options.abortSignal);return calls===1?await new Promise(resolve=>{resolveToken=resolve;}):{token:'synthetic-refresh'};}};
 class Pool{constructor(options){events.push('pool');this.options=options;}}
 const pending=createManagedIdentityPool({Pool,credential,config,...t});await Promise.resolve();assert.deepEqual(events,['token']);assert.equal(t.scheduled[0].ms,30000);
 resolveToken({token:'synthetic-prewarm'});const pool=await pending;assert.deepEqual(events,['token','pool']);assert.equal(pool.options.connectionTimeoutMillis,30000);assert.equal(pool.options.statement_timeout,10000);assert.equal(pool.options.ssl.rejectUnauthorized,true);assert.equal(t.cancelled.length,1);
 assert.equal(await pool.options.password(),'synthetic-refresh');assert.equal(calls,2);assert.equal(t.scheduled[1].ms,30000);assert.equal(t.cancelled.length,2);
});
test('hung identity SDK is bounded even if it ignores abort, no pool created or token logged',async()=>{
 const t=timers();let signal,created=false;class Pool{constructor(){created=true;}}
 const pending=createManagedIdentityPool({Pool,config,...t,credential:{getToken:(_,options)=>{signal=options.abortSignal;return new Promise(()=>{});}}});await Promise.resolve();t.scheduled[0].run();
 const error=await pending.then(()=>assert.fail('expected timeout'),error=>error);assert.equal(signal.aborted,true);assert.equal(created,false);assert.deepEqual(startupDiagnostic(error),{event:'azure_startup_failed',stage:'token',reason:'token_timeout'});assert.equal(t.cancelled.length,1);
});
test('identity failure is not retried and safe diagnostics discard SDK secrets',async()=>{
 let calls=0,created=false;const secret='synthetic-sensitive-identity-error';const error=Object.assign(new Error(secret),{code:'unknown-secret-code',response:{token:secret}}),t=timers();class Pool{constructor(){created=true;}}
 await assert.rejects(()=>createManagedIdentityPool({Pool,config,...t,credential:{getToken:async()=>{calls++;throw error;}}}),e=>e===error);
 assert.equal(calls,1);assert.equal(created,false);const logs=[];reportStartupFailure(error,line=>logs.push(line));assert.equal(logs[0],'{"event":"azure_startup_failed","stage":"token","reason":"unknown"}');assert.equal(t.cancelled.length,1);
});
test('only exact pinned pg connection timeout messages map to safe enum',async()=>{
 for(const message of ['timeout expired','timeout exceeded when trying to connect','Connection terminated due to connection timeout']){
  const error=new Error(message);await assert.rejects(()=>startupStep('database',()=>{throw error;}));assert.equal(startupDiagnostic(error).reason,'connection_timeout');
  const secret=new Error(message+' secret-token');await assert.rejects(()=>startupStep('database',()=>{throw secret;}));assert.equal(startupDiagnostic(secret).reason,'unknown');
 }
 const auth=Object.assign(new Error('timeout expired'),{code:'28P01'});assert.equal(startupDiagnostic(auth,'database').reason,'database_authentication');assert.equal(startupDiagnostic(new Error('timeout expired'),'case').reason,'unknown');
});
test('later token refresh is also bounded without adding retries',async()=>{
 const t=timers();let calls=0;class Pool{constructor(options){this.options=options;}}
 const pool=await createManagedIdentityPool({Pool,config,...t,credential:{getToken:async()=>{calls++;return calls===1?{token:'synthetic-prewarm'}:await new Promise(()=>{});}}});
 const pending=pool.options.password();await Promise.resolve();t.scheduled[1].run();await assert.rejects(()=>pending,error=>startupDiagnostic(error).reason==='token_timeout');assert.equal(calls,2);assert.equal(t.cancelled.length,2);
});
