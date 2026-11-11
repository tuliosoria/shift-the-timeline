import {PROPOSED_LIMITS} from './budget.mjs';
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
  if(!response.ok)throw new Error('Provider request unsuccessful');const raw=await response.text();if(Buffer.byteLength(raw)>16384)throw new Error('Provider response too large');const data=JSON.parse(raw);if(data.status==='incomplete'||data.incomplete_details)throw new Error('Provider response incomplete');const text=data.output?.flatMap(o=>o.type==='message'?o.content??[]:[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');const parsed=JSON.parse(text);if(!parsed||Object.keys(parsed).length!==2||typeof parsed.reply!=='string'||!parsed.reply.trim()||Buffer.byteLength(parsed.reply)>1200||!Array.isArray(parsed.unlocked)||parsed.unlocked.length>3||parsed.unlocked.some(id=>typeof id!=='string'))throw new Error('Invalid provider output');const inputTokens=data.usage?.input_tokens,outputTokens=data.usage?.output_tokens;if(!Number.isSafeInteger(inputTokens)||inputTokens<1||inputTokens>PROPOSED_LIMITS.inputTokens||!Number.isSafeInteger(outputTokens)||outputTokens<1||outputTokens>PROPOSED_LIMITS.outputTokens)throw new Error('Provider usage outside envelope');return {reply:parsed.reply,unlocked:parsed.unlocked,inputTokens,outputTokens};
 };
 return Object.defineProperty(send,'model',{value:model,enumerable:true});
}
