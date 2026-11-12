import {createHash,randomUUID} from 'node:crypto';
import {reserveCost,PROPOSED_LIMITS,validateSpendPolicy} from './budget.mjs';
import {ConflictError} from '../storage/memory.mjs';
import {aiPut,MAX_AI_ITEM_BYTES} from '../storage/ai-codec.mjs';
import {buildChatContext} from './chat-context.mjs';
import {collectConversationHistory,fitConversationHistory} from './conversation-history.mjs';
import {resolveCanonical,resolveWithAi} from '../deductions.mjs';
const DAY=86400000,FINAL=new Set(['complete','fallback']);
const write=(key,before,patch)=>({key,expectedVersion:before?.version??null,value:{...before,...patch,version:(before?.version??0)+1}});
const jobKey=id=>`AIJOB#${id}`;
const guardKey=key=>`AIBUDGET#GUARD#${key}`;
// Budget state that is missing or corrupt, as opposed to a store that could not be read.
class BudgetStateError extends Error{}
function validGuard(value,key){if(!value||value.kind!=='budget_guard'||value.budgetKey!==key||value.version!==1)throw new BudgetStateError('AI budget initialization guard missing or corrupt');return value;}
function validBudget(value){if(!value||!Number.isSafeInteger(value.version)||value.version<1||!Number.isSafeInteger(value.usedMicroUsd)||value.usedMicroUsd<0)throw new BudgetStateError('AI budget record missing or corrupt');return value;}
function target(room,job,now){if(!room||room.expiresAt<=now||room.createdAt+DAY<=now||room.caseVersion!==job.caseVersion)return null;const player=room.players.find(p=>p.id===job.playerId),interview=player?.interviews.find(i=>i.round===job.round),message=interview?.messages.find(m=>m.id===job.messageId);return message?{player,interview,message}:null;}
// A reply still lands after its turn closed or advanced; it only needs the question to be unresolved.
function current(room,job,now){const t=target(room,job,now);return t?.message.status==='pending'?t:null;}
// The job keeps the case's deductions for this suspect, so any process holding only the store can settle it.
function scopeFor(caseData,suspectId){return {deductions:(caseData.deductions??[]).filter(d=>d.sources.some(s=>s.suspectId===suspectId)).map(d=>({id:d.id,sources:d.sources.filter(s=>s.suspectId===suspectId)}))};}

// Only explicitly injected by tests/development. Production runtime does not enable this repository.
export class AiJobs {
 constructor({store,policy,now=Date.now,maintenance=false}){
  if(maintenance&&policy===undefined){if(!store)throw new Error('Store required');this.store=store;this.now=now;this.policy=null;this.reserve=null;return;}
  if(!store||!policy||typeof policy.model!=='string'||!policy.model||policy.model.length>100)throw new Error('Explicit AI policy required');
  this.policy={...PROPOSED_LIMITS,...policy};
  validateSpendPolicy(this.policy);
  this.reserve=reserveCost(this.policy);this.store=store;this.now=now;
 }
 // Returns the writes that admit an AI reply, or [] when the question must be resolved canonically.
 async prepareQuestion({room,player,interview,message,receiptKey,caseData}){
  if(!this.policy)throw new Error('Maintenance repository cannot admit questions');
  const scope=scopeFor(caseData,interview.suspectId),allowedIds=scope.deductions.map(d=>d.id);
  const now=this.now(),date=new Date(now),day=date.toISOString().slice(0,10),month=day.slice(0,7);
  const scopes=[{key:`AIBUDGET#ROOM#${room.code}`,max:this.policy.roomMicroUsd,expiresAt:room.createdAt+8*DAY},{key:`AIBUDGET#DAY#${day}`,max:this.policy.dayMicroUsd,expiresAt:Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+8)},{key:`AIBUDGET#MONTH#${month}`,max:this.policy.monthMicroUsd,expiresAt:Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,8)}];
  const id=createHash('sha256').update(`ai:${receiptKey}`).digest('hex'),deadline=now+30000,expiresAt=room.createdAt+DAY;
  const job={kind:'job',id,code:room.code,playerId:player.id,round:interview.round,messageId:message.id,suspectId:interview.suspectId,caseVersion:room.caseVersion,scope,model:this.policy.model,rates:{inputRate:this.policy.inputRate,outputRate:this.policy.outputRate},status:'pending',createdAt:now,deadline,expiresAt,dueAt:deadline,reservedMicroUsd:this.reserve,budgetKeys:scopes.map(s=>s.key)};
  let jobWrite;
  try{
   const history=collectConversationHistory({room,player,interview,message});
   const earnedIds=(player.deductions??[]).map(d=>d.id).filter(id=>allowedIds.includes(id));
   jobWrite=fitConversationHistory(history,history=>{
    const context={...buildChatContext({caseData,suspectId:interview.suspectId,history,question:message.question,currentRound:interview.round,earnedIds}),allowedIds};
    const candidate=write(jobKey(id),null,{...job,context});
    // Measure the actual Item, including indexes, duplicated keys and escaped
    // nested JSON. Leave 1 KiB for lease/fence/start/settlement/recovery fields
    // and version growth. The provider's separate context limit is enforced by
    // buildChatContext; JSON escaping must not impose a smaller storage budget.
    const {Item}=aiPut('validation',candidate).Put;
    if(Buffer.byteLength(JSON.stringify(Item))>MAX_AI_ITEM_BYTES-1024)throw new Error('AI job envelope too large');
    return candidate;
   });
  }catch{return [];}
  let balances,guards;try{[balances,guards]=await Promise.all([Promise.all(scopes.map(s=>this.store.getAi(s.key))),Promise.all(scopes.map(s=>this.store.getAi(guardKey(s.key))))]);for(let i=0;i<scopes.length;i++){if(!!balances[i]!==!!guards[i])throw new Error('AI budget initialization mismatch');if(balances[i]){validBudget(balances[i]);validGuard(guards[i],scopes[i].key);}}}catch{return [];}
  if(balances.some((b,i)=>!Number.isSafeInteger((b?.usedMicroUsd??0)+this.reserve)||(this.policy.uncapped!==true&&(b?.usedMicroUsd??0)+this.reserve>scopes[i].max)))return [];
  return [...scopes.filter((s,i)=>!guards[i]).map(s=>write(guardKey(s.key),null,{kind:'budget_guard',budgetKey:s.key,expiresAt:s.expiresAt+DAY})),...scopes.map((s,i)=>write(s.key,balances[i],{kind:'budget',usedMicroUsd:(balances[i]?.usedMicroUsd??0)+this.reserve,expiresAt:s.expiresAt})),jobWrite,write(`AIOUTBOX#${id}`,null,{kind:'outbox',jobId:id,status:'pending',deadline,expiresAt,dueAt:now})];
 }
 async dispatch(id,send){
  const key=`AIOUTBOX#${id}`,outbox=await this.store.getAi(key);if(!outbox||outbox.status!=='pending')return {status:'not_pending'};
  const expired=outbox.deadline<=this.now();if(!expired)await send({jobId:id});
  return this.retry(async()=>{const fresh=await this.store.getAi(key);if(!fresh||fresh.status!=='pending')return {status:'not_pending'};await this.store.commitAi({writes:[write(key,fresh,{status:expired?'done':'sent',dueAt:undefined})]});return {status:expired?'expired':'sent'};});
 }
 async reconcile({send,limit=25,cursor,shouldContinue=()=>true}={}){
  const page=await this.store.listAiDue(this.now(),limit,cursor);let failed=0,deferFailures=0,examined=0,lastCursor=cursor??null;
  const deadline=error=>!shouldContinue()||['AiWorkDeadline','AbortError','TimeoutError'].includes(error?.name);
  const stopped=()=>({examined,failed,deferFailures,cursor:lastCursor,stopped:true});
  for(let i=0;i<page.keys.length;i++){
   if(!shouldContinue())return stopped();const key=page.keys[i];
   try{const record=await this.store.getAi(key);
    if(record&&Number.isSafeInteger(record.dueAt)&&record.dueAt<=this.now()){
     if(record.kind==='job'&&!FINAL.has(record.status)&&record.deadline<=this.now())await this.fallback(record,'deadline');
     else if(record.kind==='outbox'&&record.status==='pending')await this.dispatch(record.jobId,send);
    }
   }catch(error){if(deadline(error))return stopped();failed++;
    try{await this.retry(async()=>{const fresh=await this.store.getAi(key);if(fresh&&Number.isSafeInteger(fresh.dueAt)&&fresh.dueAt<=this.now())await this.store.commitAi({writes:[write(key,fresh,{dueAt:this.now()+60000,lastRecoveryFailureAt:this.now()})]});});}
    catch(deferError){deferFailures++;if(deadline(deferError))return stopped();}
   }
   examined++;lastCursor=page.items?.[i]?.cursor??lastCursor;
  }
  return {examined,failed,deferFailures,cursor:page.cursor,stopped:false};
 }
 async retry(run){for(let i=0;i<8;i++)try{return await run();}catch(e){if(!(e instanceof ConflictError))throw e;}throw new ConflictError();}
 async claim(id){return this.retry(async()=>{
  const job=await this.store.getAi(jobKey(id)),now=this.now();if(!job||FINAL.has(job.status)||job.status==='provider_started'||job.status==='leased'&&job.leaseUntil>now)return null;
  const w=write(jobKey(id),job,{status:'leased',fence:randomUUID(),leaseUntil:now+5000});await this.store.commitAi({writes:[w]});return w.value;
 });}
 async markProviderStarted(claim){if(!this.policy)return false;return this.retry(async()=>{
  const job=await this.store.getAi(jobKey(claim.id));if(!job||job.status!=='leased'||job.fence!==claim.fence||job.leaseUntil<=this.now()||job.deadline<=this.now())return false;
  if(job.model!==this.policy.model||job.rates?.inputRate!==this.policy.inputRate||job.rates?.outputRate!==this.policy.outputRate||job.reservedMicroUsd!==this.reserve)return false;
  const room=await this.store.getRoom(job.code);if(!current(room,job,this.now()))return false;
  const budgetChecks=[];for(const key of job.budgetKeys){const balance=validBudget(await this.store.getAi(key)),guard=validGuard(await this.store.getAi(guardKey(key)),key);if(balance.usedMicroUsd<job.reservedMicroUsd)throw new BudgetStateError('AI budget invariant violated');budgetChecks.push({key,expectedVersion:balance.version},{key:guardKey(key),expectedVersion:guard.version});}
  const slots=await this.store.getAi('AISLOTS#GLOBAL'),now=this.now();if(job.leaseUntil<=now||job.deadline<=now)return false;
  const active=(slots?.active??[]).filter(s=>s.until>now);if(active.length>=this.policy.maxConcurrent)return false;
  active.push({id:job.id,fence:job.fence,until:now+60000});
  await this.store.commitAi({roomCode:room.code,expectedRoomVersion:room.version,checks:budgetChecks,writes:[write(jobKey(job.id),job,{status:'provider_started',providerStartedAt:now}),write('AISLOTS#GLOBAL',slots,{kind:'slots',active,expiresAt:now+8*DAY})]});return true;
 });}
 async complete(claim,{reply,unlocked,actualMicroUsd}){
  if(typeof reply!=='string'||!reply.trim()||Buffer.byteLength(reply)>1200||!Array.isArray(unlocked)||unlocked.length>3||unlocked.some(id=>typeof id!=='string')||!Number.isSafeInteger(actualMicroUsd)||actualMicroUsd<0)throw new Error('Invalid provider completion');
  return this.settle(claim,{reply,unlocked,actualMicroUsd});
 }
 async fallback(claim,reason,{costUncertain=false}={}){return this.settle(claim,{reason,costUncertain});}
 async settle(claim,result){return this.retry(async()=>{
  const job=await this.store.getAi(jobKey(claim.id));if(!job)return {status:'missing'};if(FINAL.has(job.status))return {status:job.status};if(claim.fence!==job.fence)return {status:'stale'};
  const now=this.now(),room=await this.store.getRoom(job.code),visible=current(room,job,now),started=job.status==='provider_started';
  if(result.reply&&!started)return {status:'stale'};
  if(result.actualMicroUsd>job.reservedMicroUsd)throw new Error('Provider cost exceeds reservation');
  // Missing or corrupt budget state never yields a refund: the reservation stays charged and the slot is kept.
  // The question is still resolved canonically, so a player is never left waiting. Store read failures still throw and are retried.
  const balances=[];let budgetOk=true;
  try{for(const key of job.budgetKeys)balances.push(validBudget(await this.store.getAi(key)));for(const key of job.budgetKeys)validGuard(await this.store.getAi(guardKey(key)),key);if(balances.some(b=>b.usedMicroUsd<job.reservedMicroUsd))throw new BudgetStateError('AI budget invariant violated');}
  catch(error){if(!(error instanceof BudgetStateError))throw error;budgetOk=false;}
  const completed=budgetOk&&!!result.reply&&!!visible&&now<job.deadline;
  const uncertain=!budgetOk||started&&!completed||!!result.costUncertain;
  const charge=completed?result.actualMicroUsd:uncertain?job.reservedMicroUsd:0,refund=job.reservedMicroUsd-charge;
  const writes=budgetOk?job.budgetKeys.map((k,i)=>write(k,balances[i],{usedMicroUsd:balances[i].usedMicroUsd-refund})):[];
  const finished={status:completed?'complete':'fallback',settledMicroUsd:charge,costUncertain:uncertain,finishedAt:now,reason:completed?null:budgetOk?result.reason??'stale_or_late':'budget_unavailable',dueAt:undefined};
  writes.push(write(jobKey(job.id),job,finished));
  const outbox=await this.store.getAi(`AIOUTBOX#${job.id}`);if(outbox)writes.push(write(`AIOUTBOX#${job.id}`,outbox,{status:'done',dueAt:undefined}));
  const slots=await this.store.getAi('AISLOTS#GLOBAL');if(slots&&!uncertain)writes.push(write('AISLOTS#GLOBAL',slots,{active:slots.active.filter(s=>s.id!==job.id)}));
  // Every outcome resolves a still-pending question: the AI reply when it completed in time, otherwise the canonical answer.
  const t=current(room,job,now);let changedRoom;if(t){if(completed)resolveWithAi(job.scope,t.player,t.interview,t.message,{reply:result.reply,unlocked:result.unlocked});else resolveCanonical(job.scope,t.player,t.interview,t.message);room.version++;changedRoom=room;}
  await this.store.commitAi({writes,room:changedRoom,roomCode:room?.code,expectedRoomVersion:room?room.version-(changedRoom?1:0):null});return {status:finished.status};
 });}
}
