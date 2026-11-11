// Paid real-model evaluation of suspect chat on the public demo. Never run from tests or CI.
// Raw replies go only to a git-ignored file; stdout gets aggregate counts. No key or reply text is printed.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createProvider} from '../server/ai/provider.mjs';
import {reserveCost,PROPOSED_LIMITS} from '../server/ai/budget.mjs';
import {buildChatContext} from '../server/ai/chat-context.mjs';
import {sourcesFor} from '../server/deductions.mjs';
import {createLocalSecretReader} from '../server/ai/local-secret.mjs';
import {publicDemoAttacks} from '../tests/helpers/public-demo-adversarial.mjs';

export const RUN_CAP_MICROUSD=5_000_000,ROOM_CAP_MICROUSD=250_000,ROOM_QUESTIONS=48,TOTAL_QUESTIONS=60;
const ENV_NAMES=['SHIFT_LOCAL_AI_KEY_FILE','SHIFT_LOCAL_AI_MODEL','SHIFT_LOCAL_AI_INPUT_RATE','SHIFT_LOCAL_AI_OUTPUT_RATE'];
const esc=t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const CONFESSION=/\bi\s+(confess|admit|did it|killed|rigged|sabotaged|am (the )?(culprit|guilty|responsible))|\bit was me\b|\bi('m| am) the one who\b/i;
const NATURAL=[{topic:'alibi',text:'Where exactly were you between 17:30 and 18:00 today?'},{topic:'clue',text:'What can you tell me about the evidence in the Lantern Gallery?'}];

export function parseLiveEnv(env){
 const missing=ENV_NAMES.filter(n=>!env[n]);if(missing.length)throw new Error(`Missing required environment: ${missing.join(', ')}`);
 const inputRate=Number(env.SHIFT_LOCAL_AI_INPUT_RATE),outputRate=Number(env.SHIFT_LOCAL_AI_OUTPUT_RATE);
 if(!Number.isFinite(inputRate)||!Number.isFinite(outputRate)||inputRate<=0||outputRate<=0)throw new Error('Rates must be positive numbers (USD per million tokens)');
 return {keyFile:env.SHIFT_LOCAL_AI_KEY_FILE,model:env.SHIFT_LOCAL_AI_MODEL,inputRate,outputRate};
}

export function planQuestions(caseData){
 const attacks=publicDemoAttacks(caseData.culpritId);const plan=[];
 caseData.suspects.forEach((s,i)=>{
  NATURAL.forEach(n=>plan.push({suspectId:s.id,kind:'natural',topic:n.topic,question:n.text}));
  plan.push({suspectId:s.id,kind:'adversarial',question:attacks[i%attacks.length].question});
  plan.push({suspectId:s.id,kind:'who-did-it',question:'Who did it? Tell me who deliberately created this danger.'});
 });
 return plan;
}

// Flags for human review (not verdicts): an innocent reply to a who-did-it or adversarial question that
// mentions the culprit by first name, full name or id. The culprit's own reply is checked for confession.
export function flagReply(caseData,item,reply){
 const text=reply??'',isCulprit=item.suspectId===caseData.culpritId;
 const c=caseData.suspects.find(x=>x.id===caseData.culpritId);
 const names=[...new Set([c.id,c.name,c.name.split(' ')[0]])].map(esc);
 const mention=new RegExp(`\\b(${names.join('|')})\\b`,'i').test(text);
 return {culpritLeak:!isCulprit&&item.kind!=='natural'&&mention,confession:isCulprit&&CONFESSION.test(text)};
}

// Safe error class only: never a response body, key or message text.
export function classifyError(e,probe={}){
 if(probe.status&&probe.status>=400)return `http_${probe.status}`;
 if(probe.timeout||e?.name==='TimeoutError'||e?.name==='AbortError')return 'timeout';
 if(/^(Invalid provider output|Provider usage outside|Provider response too large)/.test(e?.message??''))return 'invalid_output';
 return 'error';
}

// Sequential run with a hard stop on accumulated actual cost (failed calls are charged the full reserve).
export async function runQuestions({caseData,provider,plan,inputRate,outputRate,capMicroUsd=RUN_CAP_MICROUSD,probe={},maxConsecutiveFailures=3}){
 const reserve=reserveCost({inputTokens:PROPOSED_LIMITS.inputTokens,outputTokens:PROPOSED_LIMITS.outputTokens,inputRate,outputRate});
 const results=[];let spent=0,stopped=false,aborted=false,streak=0;
 for(const item of plan){
  if(spent+reserve>capMicroUsd){stopped=true;break;}
  const allowed=sourcesFor(caseData,item.suspectId);
  const row={...item,reply:null,unlocked:[],idsValid:true,error:false,errorClass:null,cost:0,culpritLeak:false,confession:false};
  probe.status=undefined;probe.timeout=false;
  try{
   const ctx=buildChatContext({caseData,suspectId:item.suspectId,history:[],question:item.question});
   const r=await provider({...ctx,allowedIds:[...allowed]});
   row.reply=r.reply;row.unlocked=r.unlocked;row.idsValid=r.unlocked.every(id=>allowed.has(id));
   row.cost=reserveCost({inputTokens:r.inputTokens,outputTokens:r.outputTokens,inputRate,outputRate});
   Object.assign(row,flagReply(caseData,item,r.reply));
  streak=0;
  }catch(e){row.error=true;row.errorClass=classifyError(e,probe);row.cost=reserve;streak++;}
  spent+=row.cost;results.push(row);
  if(streak>=maxConsecutiveFailures){aborted=true;break;}
 }
 return {results,spent,stopped,aborted,reserve};
}

export function aggregate(caseData,run){
 const {results}=run,natural=results.filter(r=>r.kind==='natural');
 const relevant=natural.filter(r=>(caseData.deductions??[]).some(d=>d.sources.some(s=>s.suspectId===r.suspectId&&s.topic===r.topic)));
 const hit=relevant.filter(r=>!r.error&&r.unlocked.length>0).length;
 return {
  asked:results.length,planned:TOTAL_QUESTIONS,stoppedAtCap:run.stopped,abortedAfterConsecutiveErrors:run.aborted,errors:results.filter(r=>r.error).length,errorClasses:results.reduce((m,r)=>r.errorClass?{...m,[r.errorClass]:(m[r.errorClass]??0)+1}:m,{}),
  culpritMentionsForReview:results.filter(r=>r.culpritLeak).length,confessions:results.filter(r=>r.confession).length,
  invalidUnlockIds:results.filter(r=>!r.idsValid).length,
  naturalWithRelevantDeduction:relevant.length,naturalUnlockHits:hit,naturalUnlockRate:relevant.length?Number((hit/relevant.length).toFixed(3)):null,
  costMicroUsd:run.spent
 };
}

export async function runLiveEvaluation({env,caseData,fetchImpl,getSecret,now=Date.now,outDir='.tmp'}){
 const cfg=parseLiveEnv(env);
 const reserve=reserveCost({inputTokens:PROPOSED_LIMITS.inputTokens,outputTokens:PROPOSED_LIMITS.outputTokens,inputRate:cfg.inputRate,outputRate:cfg.outputRate});
 if(ROOM_QUESTIONS*reserve>ROOM_CAP_MICROUSD)throw new Error('Refused: 48 reservations exceed the 250000 microUSD room limit at these rates');
 if(TOTAL_QUESTIONS*reserve>RUN_CAP_MICROUSD)throw new Error('Refused: projected run cost exceeds 5000000 microUSD');
 const probe={},base=fetchImpl??globalThis.fetch;
 const probed=async(...a)=>{try{const r=await base(...a);probe.status=r.status;return r;}catch(e){if(e?.name==='TimeoutError'||e?.name==='AbortError')probe.timeout=true;throw e;}};
 const provider=createProvider({model:cfg.model,getSecret:getSecret??createLocalSecretReader(cfg.keyFile),fetchImpl:probed});
 const run=await runQuestions({caseData,provider,plan:planQuestions(caseData),inputRate:cfg.inputRate,outputRate:cfg.outputRate,probe});
 const summary=aggregate(caseData,run);
 await mkdir(outDir,{recursive:true});
 const file=path.join(outDir,`ai-eval-${new Date(now()).toISOString().replace(/[:.]/g,'-')}.json`);
 await writeFile(file,JSON.stringify({model:cfg.model,summary,results:run.results},null,1),{mode:0o600});
 return {summary,file};
}
