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
const CULPRIT_LIKE=/rowan.*(did|culprit|guilty|cleared|responsible)/i;
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

export function flagReply(caseData,item,reply){
 const isCulprit=item.suspectId===caseData.culpritId,text=reply??'';
 return {culpritLeak:!isCulprit&&CULPRIT_LIKE.test(text),confession:isCulprit&&CONFESSION.test(text)};
}

// Sequential run with a hard stop on accumulated actual cost (failed calls are charged the full reserve).
export async function runQuestions({caseData,provider,plan,inputRate,outputRate,capMicroUsd=RUN_CAP_MICROUSD}){
 const reserve=reserveCost({inputTokens:PROPOSED_LIMITS.inputTokens,outputTokens:PROPOSED_LIMITS.outputTokens,inputRate,outputRate});
 const results=[];let spent=0,stopped=false;
 for(const item of plan){
  if(spent+reserve>capMicroUsd){stopped=true;break;}
  const allowed=sourcesFor(caseData,item.suspectId);
  const row={...item,reply:null,unlocked:[],idsValid:true,error:false,cost:0,culpritLeak:false,confession:false};
  try{
   const ctx=buildChatContext({caseData,suspectId:item.suspectId,history:[],question:item.question});
   const r=await provider({...ctx,allowedIds:[...allowed]});
   row.reply=r.reply;row.unlocked=r.unlocked;row.idsValid=r.unlocked.every(id=>allowed.has(id));
   row.cost=reserveCost({inputTokens:r.inputTokens,outputTokens:r.outputTokens,inputRate,outputRate});
   Object.assign(row,flagReply(caseData,item,r.reply));
  }catch{row.error=true;row.cost=reserve;}
  spent+=row.cost;results.push(row);
 }
 return {results,spent,stopped,reserve};
}

export function aggregate(caseData,run){
 const {results}=run,natural=results.filter(r=>r.kind==='natural');
 const relevant=natural.filter(r=>(caseData.deductions??[]).some(d=>d.sources.some(s=>s.suspectId===r.suspectId&&s.topic===r.topic)));
 const hit=relevant.filter(r=>!r.error&&r.unlocked.length>0).length;
 return {
  asked:results.length,planned:TOTAL_QUESTIONS,stoppedAtCap:run.stopped,errors:results.filter(r=>r.error).length,
  culpritLeaks:results.filter(r=>r.culpritLeak).length,confessions:results.filter(r=>r.confession).length,
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
 const provider=createProvider({model:cfg.model,getSecret:getSecret??createLocalSecretReader(cfg.keyFile),...(fetchImpl?{fetchImpl}:{})});
 const run=await runQuestions({caseData,provider,plan:planQuestions(caseData),inputRate:cfg.inputRate,outputRate:cfg.outputRate});
 const summary=aggregate(caseData,run);
 await mkdir(outDir,{recursive:true});
 const file=path.join(outDir,`ai-eval-${new Date(now()).toISOString().replace(/[:.]/g,'-')}.json`);
 await writeFile(file,JSON.stringify({model:cfg.model,summary,results:run.results},null,1),{mode:0o600});
 return {summary,file};
}
