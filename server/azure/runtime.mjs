import {readFile,stat} from 'node:fs/promises';
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

export async function readPinnedCase(config) {
 const size=(await stat(config.caseFile)).size;
 if(size>200000||size<1)throw Object.assign(new Error('Case artifact unavailable.'),{code:'SHIFT_CASE_SIZE'});
 const bytes=await readFile(config.caseFile);
 if(bytes.length>200000||createHash('sha256').update(bytes).digest('hex')!==config.caseHash)throw Object.assign(new Error('Case integrity mismatch.'),{code:'SHIFT_CASE_INTEGRITY'});
 return validateCase(JSON.parse(bytes.toString('utf8')));
}
export async function createAzureRuntime({env=process.env,store,loadCaseImpl=readPinnedCase,fetchImpl=fetch,now=Date.now}) {
 const config=await startupStep('config',()=>readAzureConfig(env));
 if(!store||typeof store.checkReady!=='function'||typeof store.cleanupExpired!=='function')throw new Error('Durable PostgreSQL store required.');
 await startupStep('database',()=>store.checkReady());
 const data=await startupStep('case',()=>loadCaseImpl(config));
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
