import {PROPOSED_LIMITS} from './budget.mjs';
const MAX_RESPONSE_BYTES=16384;
// Enforce the transport ceiling while reading, not after buffering an arbitrary body.
// Cancel without awaiting an upstream cancellation acknowledgement, which can stall.
function cancelBody(body){try{void body?.cancel().catch(()=>{});}catch{}}
async function boundedResponseText(response){
 const reader=response.body?.getReader();if(!reader)throw new Error('Provider response body unavailable');
 const chunks=[];let size=0,finished=false;
 try{
  for(;;){const {done,value}=await reader.read();if(done){finished=true;break;}
   size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw new Error('Provider response too large');
   chunks.push(value);
  }
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size));
 }finally{if(!finished)cancelBody(reader);reader.releaseLock();}
}
// The Responses API can mix reasoning, tool calls, refusals and messages. Never
// stitch unrelated fragments into apparently valid suspect dialogue. This app
// requests no tools and accepts one completed assistant message only.
function replyText(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.status!=='completed'||data.error!=null||data.incomplete_details!=null)throw new Error('Provider response not completed');
 if(!Array.isArray(data.output))throw new Error('Invalid provider response output');
 let message;
 for(const item of data.output){
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid provider response output');
  if(item.type==='reasoning'){
   if(item.status!==undefined&&item.status!=='completed')throw new Error('Provider reasoning not completed');
   continue;
  }
  if(item.type!=='message'||message||item.role!=='assistant'||item.status!=='completed')throw new Error('Invalid provider response message');
  message=item;
 }
 if(!message||!Array.isArray(message.content)||message.content.length!==1)throw new Error('Invalid provider response content');
 const content=message.content[0];
 if(!content||content.type!=='output_text'||typeof content.text!=='string')throw new Error('Invalid provider response content');
 return content.text;
}
export function createProvider({model,getSecret,fetchImpl=fetch}){
 if(typeof model!=='string'||!model||typeof getSecret!=='function')throw new Error('Explicit approved model and secret provider required');
 const send=async(context,{now=Date.now,deadline=now()+20000,startBy=deadline}={})=>{
  const {instructions,input,allowedIds}=context??{};for(const value of [instructions,input])if(typeof value!=='string'||!value)throw new Error('Scoped context required');if(!Array.isArray(allowedIds)||allowedIds.some(id=>typeof id!=='string'))throw new Error('Scoped context required');
  // Conservative UTF-8 byte ceiling leaves room for protocol/schema overhead below the 6000-token envelope.
  if(Buffer.byteLength(instructions+input)>20000)throw new Error('Context exceeds conservative input envelope');
  // Preserve medium reasoning for grounded replies and deduction decisions. The output
  // envelope includes reasoning tokens as well as visible JSON; incomplete output falls back.
  // Pin Standard pricing and disable implicit cache writes; neither follows project defaults.
  const payload={model,reasoning:{effort:'medium'},input:[{role:'developer',content:instructions},{role:'user',content:input}],service_tier:'default',prompt_cache_options:{mode:'explicit'},store:false,max_output_tokens:PROPOSED_LIMITS.outputTokens,text:{format:{type:'json_schema',name:'suspect_reply',strict:true,schema:{type:'object',properties:{reply:{type:'string'},unlocked:{type:'array',items:{type:'string'}}},required:['reply','unlocked'],additionalProperties:false}}}};
  if(now()>=deadline||now()>=startBy)throw new Error('Provider start deadline expired');
  const secret=await getSecret();if(typeof secret!=='string'||!secret)throw new Error('Secret unavailable');
  const remaining=Math.min(20000,Math.floor(deadline-now()));if(remaining<=0||now()>=startBy)throw new Error('Provider start deadline expired');
  const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(remaining)});
  if(!response.ok){cancelBody(response.body);throw new Error('Provider request unsuccessful');}const raw=await boundedResponseText(response);const data=JSON.parse(raw);const parsed=JSON.parse(replyText(data));if(!parsed||Array.isArray(parsed)||Object.keys(parsed).length!==2||typeof parsed.reply!=='string'||!parsed.reply.trim()||Buffer.byteLength(parsed.reply)>1200||!Array.isArray(parsed.unlocked)||parsed.unlocked.length>3||parsed.unlocked.some(id=>typeof id!=='string'))throw new Error('Invalid provider output');const inputTokens=data.usage?.input_tokens,outputTokens=data.usage?.output_tokens;if(!Number.isSafeInteger(inputTokens)||inputTokens<1||inputTokens>PROPOSED_LIMITS.inputTokens||!Number.isSafeInteger(outputTokens)||outputTokens<1||outputTokens>PROPOSED_LIMITS.outputTokens)throw new Error('Provider usage outside envelope');return {reply:parsed.reply,unlocked:parsed.unlocked,inputTokens,outputTokens};
 };
 return Object.defineProperty(send,'model',{value:model,enumerable:true});
}
