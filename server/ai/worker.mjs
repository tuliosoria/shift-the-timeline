import {reserveCost} from './budget.mjs';
// The injected repository owns durable reservations, fencing and conditional final commits.
export async function runJob({enabled=false,jobId,repository,provider,rates,now=Date.now}){
 if(!enabled)return {status:'disabled'};
 const job=await repository.claim(jobId);if(!job)return {status:'not_claimed'};
 if(job.deadline<=now())return repository.fallback(job,'deadline',{costUncertain:false});
 if(job.model&&provider.model!==job.model)return repository.fallback(job,'model_mismatch',{costUncertain:false});
 let started=false;
 try{
  const marked=await repository.markProviderStarted(job);if(!marked)return repository.fallback(job,'not_started',{costUncertain:false});started=true;
  if(job.deadline<=now()||job.leaseUntil!==undefined&&job.leaseUntil<=now())return repository.fallback(job,'start_deadline',{costUncertain:false});
  const result=await provider(job.context,{now,deadline:job.deadline,startBy:job.leaseUntil??job.deadline});const actualMicroUsd=reserveCost({...rates,...job.rates,inputTokens:result.inputTokens,outputTokens:result.outputTokens});
  if(actualMicroUsd>job.reservedMicroUsd)throw new Error('Usage exceeded reservation');
  if(job.deadline<=now())return repository.fallback(job,'deadline',{costUncertain:true});
  return await repository.complete(job,{voice:result.text,actualMicroUsd});
 }catch{return repository.fallback(job,'unavailable',{costUncertain:started});}
}
