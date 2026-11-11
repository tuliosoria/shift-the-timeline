import {readFile,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readAzureConfig} from './config.mjs';
import {startupStep} from './diagnostics.mjs';
import {releaseResponse} from './release.mjs';
import {validateCase} from '../case-loader.mjs';
import {DurableGame} from '../persistent-game.mjs';
import {Sessions} from '../sessions.mjs';
import {createRateLimiter} from '../limits.mjs';
import {createApi,HEADERS} from '../api.mjs';
import {DomainError} from '../game.mjs';
import {AiJobs} from '../ai/jobs.mjs';
import {runJob} from '../ai/worker.mjs';
import {createProvider} from '../ai/provider.mjs';
import {createDispatchPool,createPooledTick} from '../ai/dispatch-pool.mjs';

const startupNotice=reason=>JSON.stringify({event:'azure_startup_notice',reason});
// The case must match the operator pin, or the digest recorded in the same verified release package
// (case-manifest.json at the package root, written by package-azure). Anyone able to alter that
// package could alter the server code too, so this adds no new trust; it keeps a content release
// from stranding the site on an older SHIFT_CASE_SHA256 setting. Update the pin afterwards.
async function packageDigest(caseFile){
 try{const manifest=JSON.parse(await readFile(resolve(dirname(caseFile),'..','case-manifest.json'),'utf8'));return /^[a-f0-9]{64}$/.test(manifest?.sha256??'')?manifest.sha256:null;}catch{return null;}
}
export async function readPinnedCase(config,notice=console.warn) {
 const size=(await stat(config.caseFile)).size;
 if(size>200000||size<1)throw Object.assign(new Error('Case artifact unavailable.'),{code:'SHIFT_CASE_SIZE'});
 const bytes=await readFile(config.caseFile);
 const digest=createHash('sha256').update(bytes).digest('hex');
 if(bytes.length>200000)throw Object.assign(new Error('Case integrity mismatch.'),{code:'SHIFT_CASE_INTEGRITY'});
 if(digest!==config.caseHash){
  if(digest!==await packageDigest(config.caseFile))throw Object.assign(new Error('Case integrity mismatch.'),{code:'SHIFT_CASE_INTEGRITY'});
  notice(startupNotice('case_pin_superseded'));
 }
 return validateCase(JSON.parse(bytes.toString('utf8')));
}
export async function createAzureRuntime({env=process.env,store,loadCaseImpl=readPinnedCase,fetchImpl=fetch,now=Date.now,notice=console.warn}) {
 const config=await startupStep('config',()=>readAzureConfig(env));
 if(config.aiPolicyRejected)notice(startupNotice('ai_policy_invalid'));
 if(!store||typeof store.checkReady!=='function'||typeof store.cleanupExpired!=='function')throw new Error('Durable PostgreSQL store required.');
 await startupStep('database',()=>store.checkReady());
 const data=await startupStep('case',()=>loadCaseImpl(config,notice));
 const jobs=config.policy?new AiJobs({store,policy:config.policy,now}):null;
 // No jobs or provider are constructed unless explicitly opted in at deployment.
 const provider=jobs?createProvider({model:config.policy.model,getSecret:async()=>env.OPENAI_API_KEY,fetchImpl}):null;
 const game=new DurableGame({store,...data,ai:jobs,now});
 const limiter=createRateLimiter({store,now});
 const api=createApi({game,sessions:new Sessions({store,secure:true,now}),allowedOrigin:config.origin,rateLimit:async input=>{
  if(!config.allowNewRooms&&input.path==='/api/rooms'&&input.request.method==='POST')throw new DomainError('New rooms are temporarily paused.',503);
  // The Azure transport validates platform-overwritten CLIENT-IP; generic transports use the socket.
  await limiter(input);
 }});
 let timer=null,maintenance=null,maintenanceTimer=null,stopped=false;
 // Replies run in parallel up to the policy's concurrency; a tick never waits on a provider call.
 const pool=jobs?createDispatchPool({limit:config.policy.maxConcurrent,run:({jobId})=>runJob({enabled:!stopped,jobId,repository:jobs,provider,rates:config.policy,now})}):null;
 const pooledTick=jobs?createPooledTick({pool,shouldContinue:()=>!stopped,reconcile:options=>jobs.reconcile({limit:25,...options})}):null;
 const tick=()=>stopped||!jobs?Promise.resolve({status:'disabled'}):pooledTick();
 const maintain=()=>{
  if(stopped)return Promise.resolve(0);
  if(maintenance)return maintenance;
  maintenance=Promise.resolve().then(()=>store.cleanupExpired(now(),500)).finally(()=>{maintenance=null;});
  return maintenance;
 };
 const start=()=>{
  if(stopped)throw new Error('Worker stopped.');
  if(!maintenanceTimer){maintenanceTimer=setInterval(()=>{void maintain().catch(()=>{});},60000);maintenanceTimer.unref?.();}
  if(!jobs||timer)return;timer=setInterval(()=>{void tick().catch(()=>{});},1000);timer.unref?.();
 };
 const stop=async()=>{stopped=true;if(timer)clearInterval(timer);if(maintenanceTimer)clearInterval(maintenanceTimer);timer=null;maintenanceTimer=null;await Promise.all([pooledTick?.idle(),maintenance]);};
 const handler=async(request,context)=>{
  if(new URL(request.url).pathname==='/api/release')return releaseResponse(request);
  if(new URL(request.url).pathname==='/healthz'){
   if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:HEADERS});
   try{await store.checkReady();return new Response(request.method==='HEAD'?null:'ok',{headers:{...HEADERS,'Content-Type':'text/plain'}});}
   catch{return new Response(request.method==='HEAD'?null:'unavailable',{status:503,headers:{...HEADERS,'Content-Type':'text/plain'}});}
  }
  return api(request,context);
 };
 return {api:handler,config,start,stop,tick,maintain};
}
