import {runJob} from './worker.mjs';
const valid=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
// Adapters are injected. No handler creates credentials, queue clients or an enabled provider.
export function createQueueHandler({enabled=false,repository,provider,now=Date.now}){
 return async event=>{const batchItemFailures=[];if(!enabled)return {batchItemFailures};
  for(const record of event.Records??[])try{const body=JSON.parse(record.body);if(Object.keys(body).length!==1||!valid(body.jobId))throw new Error('Invalid queue message');await runJob({enabled:true,jobId:body.jobId,repository,provider,now});}catch{batchItemFailures.push({itemIdentifier:record.messageId});}
  return {batchItemFailures};
 };
}
export function createStreamHandler({enabled=false,repository,send}){
 return async event=>{const batchItemFailures=[];if(!enabled)return {batchItemFailures};
  for(const record of event.Records??[]){const pk=record.dynamodb?.Keys?.pk?.S;if(!['INSERT','MODIFY'].includes(record.eventName)||!pk?.startsWith('AIOUTBOX#')||!valid(pk.slice(9)))continue;
   try{await repository.dispatch(pk.slice(9),send);}catch{batchItemFailures.push({itemIdentifier:record.dynamodb.SequenceNumber});}
  }
  return {batchItemFailures};
 };
}
