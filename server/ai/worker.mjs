import {reserveCost} from './budget.mjs';
// Repository must atomically reserve budget, claim with fencing, and guard final commits.
// This contract is not wired to a production queue until the durable outbox is implemented.
export async function runJob({enabled=false,jobId,repository,provider,rates,now=Date.now}){
 if(!enabled)return {status:'disabled'};
 const job=await repository.claim(jobId);if(!job)return {status:'not_claimed'};
 if(job.deadline<=now())return repository.fallback(job,'deadline',{costUncertain:false});
 let started=false;
 try{
  const marked=await repository.markProviderStarted(job);if(!marked)return {status:'stale'};started=true;
  const result=await provider(job.context);const actualMicroUsd=reserveCost({...rates,inputTokens:result.inputTokens,outputTokens:result.outputTokens});
  if(actualMicroUsd>job.reservedMicroUsd)throw new Error('Usage exceeded reservation');
  if(job.deadline<=now())return repository.fallback(job,'deadline',{costUncertain:true});
  return await repository.complete(job,{voice:result.text,actualMicroUsd});
 }catch{return repository.fallback(job,'unavailable',{costUncertain:started});}
}
