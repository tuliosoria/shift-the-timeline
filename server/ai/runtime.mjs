import {SQSClient,SendMessageCommand} from '@aws-sdk/client-sqs';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {DynamoStore} from '../storage/dynamodb.mjs';
import {ConflictError} from '../storage/memory.mjs';
import {AiJobs} from './jobs.mjs';
import {parseAiPolicy} from './policy.mjs';
import {createProvider} from './provider.mjs';
import {createQueueHandler,createStreamHandler} from './delivery.mjs';
const CURSOR='AICURSOR#RECONCILER',KINDS=['worker','relay','reconciler'];
function config(kind,env){
 if(env.AWS_REGION!=='us-east-1'||!/^[A-Za-z0-9_.-]{3,255}$/.test(env.SHIFT_TABLE??''))throw new Error('Invalid region/table configuration');
 const queue=env.SHIFT_AI_QUEUE_ARN?.match(/^arn:aws:sqs:us-east-1:(\d{12}):([A-Za-z0-9_-]{1,80})$/);if(!queue)throw new Error('Invalid queue ARN configuration');
 const result={table:env.SHIFT_TABLE,region:'us-east-1',queueArn:env.SHIFT_AI_QUEUE_ARN};
 if(kind!=='worker'){const expected=`https://sqs.us-east-1.amazonaws.com/${queue[1]}/${queue[2]}`;if(env.SHIFT_AI_QUEUE_URL!==expected)throw new Error('Invalid queue URL configuration');result.queueUrl=expected;}
 if(kind==='relay'){const prefix=`arn:aws:dynamodb:us-east-1:${queue[1]}:table/${env.SHIFT_TABLE}/stream/`;if(!env.SHIFT_AI_STREAM_ARN?.startsWith(prefix)||!/^[0-9T:.-]+$/.test(env.SHIFT_AI_STREAM_ARN.slice(prefix.length)))throw new Error('Invalid stream ARN configuration');result.streamArn=env.SHIFT_AI_STREAM_ARN;}
 if(kind==='worker'){
  const prefix=`arn:aws:secretsmanager:us-east-1:${queue[1]}:secret:`;if(!env.SHIFT_AI_SECRET_ARN?.startsWith(prefix)||!/^[A-Za-z0-9/_+=.@-]{1,512}$/.test(env.SHIFT_AI_SECRET_ARN.slice(prefix.length)))throw new Error('Invalid secret ARN configuration');result.secretArn=env.SHIFT_AI_SECRET_ARN;
  result.policy=parseAiPolicy(env.SHIFT_AI_POLICY);
 }
 return Object.freeze(result);
}
function verifyRecords(event,source,arn,max){if(!Array.isArray(event?.Records)||event.Records.length>max||event.Records.some(r=>r.eventSource!==source||r.eventSourceARN!==arn))throw new Error('Invalid event source');}
function sender(cfg,deps){let client;return async(body,{signal}={})=>{if(Object.keys(body).length!==1||!/^[a-f0-9]{64}$/.test(body.jobId??''))throw new Error('Invalid queue job');client??=(deps.queueClientFactory??(()=>new SQSClient({region:cfg.region})))();await client.send(new SendMessageCommand({QueueUrl:cfg.queueUrl,MessageBody:JSON.stringify(body)}),signal?{abortSignal:signal}:undefined);};}
function secretReader(cfg,deps){let client;return async()=>{try{client??=(deps.secretClientFactory??(()=>new SecretsManagerClient({region:cfg.region})))();const response=await client.send(new GetSecretValueCommand({SecretId:cfg.secretArn}));const value=JSON.parse(response.SecretString??'{}');if(Object.keys(value).length!==1||typeof value.apiKey!=='string'||!value.apiKey||value.apiKey.length>512)throw new Error();return value.apiKey;}catch{throw new Error('AI credential unavailable');}};}
function reconciler({store,send,now}){return async(_event,context={})=>{
 const remaining=()=>context.getRemainingTimeInMillis?.()??60000;
 if(remaining()<=5000)return {status:'deferred',pages:0,examined:0,failed:0,deferFailures:0,backlog:true};
 const workSignal=AbortSignal.timeout(Math.max(1,Math.floor(remaining()-5000)));
 const available=()=>remaining()>5000&&!workSignal.aborted;
 const guard=()=>{if(!available()){const e=new Error('Work deadline');e.name='AiWorkDeadline';throw e;}};
 const scoped=store.withAbortSignal?.(workSignal)??store;
 const workStore=new Proxy(scoped,{get(target,key){const value=target[key];return typeof value==='function'?(...args)=>{guard();return value.apply(target,args);}:value;}});
 const repository=new AiJobs({store:workStore,maintenance:true,now});
 const workSend=body=>{guard();return send(body,{signal:workSignal});};
 const prior=await workStore.getAi(CURSOR);if(prior&&(!Number.isSafeInteger(prior.version)||prior.version<1||prior.kind!=='cursor'||Buffer.byteLength(JSON.stringify(prior.cursor))>2048))throw new Error('Invalid reconciliation cursor');
 let cursor=prior?.cursor??null,pages=0,examined=0,failed=0,deferFailures=0,stopped=false;
 while(pages<4&&available()){
  let result;try{result=await repository.reconcile({send:workSend,limit:25,cursor,shouldContinue:available});}
  catch(error){if(!available()||['AiWorkDeadline','AbortError','TimeoutError'].includes(error?.name)){stopped=true;break;}throw error;}
  pages++;examined+=result.examined;failed+=result.failed;deferFailures+=result.deferFailures;cursor=result.cursor;stopped=result.stopped;if(stopped||!cursor)break;
 }
 let cursorSaved=false;
 if(pages&&remaining()>1000)try{const checkpointSignal=AbortSignal.timeout(Math.max(1,Math.floor(remaining()-1000))),checkpoint=store.withAbortSignal?.(checkpointSignal)??store;await checkpoint.commitAi({writes:[{key:CURSOR,expectedVersion:prior?.version??null,value:{kind:'cursor',version:(prior?.version??0)+1,cursor,expiresAt:now()+7*86400000}}]});cursorSaved=true;}catch(e){if(!(e instanceof ConflictError))throw e;}
 return {status:stopped?'deferred':failed?'partial':'ok',pages,examined,failed,deferFailures,backlog:stopped||!!cursor||!cursorSaved,cursorSaved};
};}
export async function createAiRuntime(kind,{env=process.env,dependencies={},now=Date.now}={}){
 if(!KINDS.includes(kind))throw new Error('Invalid AI runtime kind');
 if(env[`SHIFT_AI_${kind.toUpperCase()}_ENABLED`]!=='true')return kind==='reconciler'?async()=>({status:'disabled'}):async()=>({batchItemFailures:[]});
 const cfg=config(kind,env),store=(dependencies.storeFactory??(table=>new DynamoStore({tableName:table})))(cfg.table);
 const repository=new AiJobs({store,now,...(kind==='worker'?{policy:cfg.policy}:{maintenance:true})});
 if(kind==='worker'){const provider=createProvider({model:cfg.policy.model,getSecret:secretReader(cfg,dependencies),fetchImpl:dependencies.fetchImpl??fetch});const handle=createQueueHandler({enabled:true,repository,provider,now});return async event=>{verifyRecords(event,'aws:sqs',cfg.queueArn,10);return handle(event);};}
 const send=sender(cfg,dependencies);
 if(kind==='relay'){const handle=createStreamHandler({enabled:true,repository,send});return async event=>{verifyRecords(event,'aws:dynamodb',cfg.streamArn,100);return handle(event);};}
 return reconciler({store,send,now});
}
export function createLambdaEntry(kind,{factory=createAiRuntime,log=console.error}={}){
 let runtime;
 return async(event,context)=>{try{runtime??=Promise.resolve().then(()=>factory(kind));let handler;try{handler=await runtime;}catch(e){runtime=undefined;throw e;}return await handler(event,context);}catch{log(JSON.stringify({event:'ai_runtime_unavailable',kind}));throw new Error('AI runtime unavailable');}};
}
