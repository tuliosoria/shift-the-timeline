import {AiJobs} from './jobs.mjs';
import {runJob} from './worker.mjs';
import {createProvider} from './provider.mjs';
import {createDispatchPool,createPooledTick} from './dispatch-pool.mjs';
import {PROPOSED_LIMITS,reserveCost,validateSpendPolicy} from './budget.mjs';

// Per-process trial limits, not durable account-wide spending controls. Restart resets them.
export function readLocalAiConfig(env={}) {
 const fail=()=>{throw new Error('Local AI requires explicit loopback trial configuration and approved pricing/limits.');};
 if(env.SHIFT_LOCAL_AI_ENABLED!=='true'||env.SHIFT_LOCAL_AI_CONSENT!=='true'||env.NODE_ENV==='production')fail();
 if(['SHIFT_TABLE','SHIFT_CASE_BUCKET','SHIFT_CASE_KEY','SHIFT_CASE_SHA256','SHIFT_ORIGIN_SECRET_ARN','AWS_LAMBDA_FUNCTION_NAME'].some(key=>env[key]))fail();
 let origin;try{origin=new URL(env.SHIFT_ORIGIN);}catch{fail();}
 if(origin.protocol!=='http:'||!['127.0.0.1','[::1]','localhost'].includes(origin.hostname)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)fail();
 const model=env.SHIFT_LOCAL_AI_MODEL;
 if(typeof model!=='string'||!model.trim()||model.length>100||!/^[a-zA-Z0-9._-]+$/.test(model))fail();
 const number=key=>{const raw=env[key];if(typeof raw!=='string'||!raw.trim())fail();const value=Number(raw);if(!Number.isFinite(value)||value<=0)fail();return value;};
 const inputRate=number('SHIFT_LOCAL_AI_INPUT_RATE'),outputRate=number('SHIFT_LOCAL_AI_OUTPUT_RATE');
 const maxCalls=number('SHIFT_LOCAL_AI_MAX_CALLS'),maxReserve=number('SHIFT_LOCAL_AI_MAX_RESERVE_MICROUSD');
 if(!Number.isSafeInteger(maxCalls)||maxCalls>12||!Number.isSafeInteger(maxReserve)||maxReserve>250000)fail();
 // The room limit must fit a full room of reservations; the per-process allowance still caps every paid attempt.
 const policy={model,inputRate,outputRate,maxConcurrent:1,roomMicroUsd:PROPOSED_LIMITS.roomMicroUsd,dayMicroUsd:maxReserve,monthMicroUsd:maxReserve};
 const reservation=reserveCost({...policy,inputTokens:PROPOSED_LIMITS.inputTokens,outputTokens:PROPOSED_LIMITS.outputTokens});
 if(reservation>maxReserve)fail();
 try{validateSpendPolicy({...PROPOSED_LIMITS,...policy});}catch{fail();}
 return Object.freeze({origin:origin.origin,host:origin.hostname==='[::1]'?'::1':origin.hostname,port:Number(origin.port||80),maxCalls,maxReserve,reservation,policy:Object.freeze(policy)});
}

export function createLocalAi({env,store,getSecret,fetchImpl=fetch,now=Date.now}) {
 const config=readLocalAiConfig(env); // Validate before constructing/reading any secret provider.
 let calls=0,reserved=0,stopped=false,timer=null;
 const guardedFetch=async(...args)=>{
  if(stopped||calls>=config.maxCalls||reserved+config.reservation>config.maxReserve)throw new Error('Local AI trial limit reached.');
  calls++;reserved+=config.reservation; // No refunds, including provider errors and timeouts.
  return fetchImpl(...args);
 };
 const rawProvider=createProvider({model:config.policy.model,getSecret,fetchImpl:guardedFetch});
 const provider=Object.assign(async(...args)=>{
  if(stopped||calls>=config.maxCalls||reserved+config.reservation>config.maxReserve)throw new Error('Local AI trial limit reached.');
  return rawProvider(...args);
 },{model:config.policy.model});
 const repository=new AiJobs({store,policy:config.policy,now});
 const admission={prepareQuestion:async args=>{
  if(stopped)return [];
  return repository.prepareQuestion(args);
 }};
 // Same hand-off as the Azure runtime; the local policy allows one provider call at a time.
 const pool=createDispatchPool({limit:config.policy.maxConcurrent,run:({jobId})=>runJob({enabled:!stopped,jobId,repository,provider,rates:config.policy,now})});
 const pooledTick=createPooledTick({pool,shouldContinue:()=>!stopped,reconcile:options=>repository.reconcile({limit:12,...options})});
 const tick=()=>stopped?Promise.resolve({stopped:true}):pooledTick();
 const start=()=>{if(stopped)throw new Error('Local AI worker stopped.');if(timer)return;timer=setInterval(()=>{void tick().catch(()=>{});},1000);timer.unref?.();};
 const stop=async()=>{stopped=true;if(timer)clearInterval(timer);timer=null;await pooledTick.idle();};
 return {config,admission,tick,start,stop,stats:()=>({calls,reservedMicroUsd:reserved,stopped})};
}
