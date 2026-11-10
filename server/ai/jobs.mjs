import {createHash,randomUUID} from 'node:crypto';
import {reserveCost,PROPOSED_LIMITS} from './budget.mjs';
import {ConflictError} from '../storage/memory.mjs';
const DAY=86400000,FINAL=new Set(['complete','fallback']);
const write=(key,before,patch)=>({key,expectedVersion:before?.version??null,value:{...before,...patch,version:(before?.version??0)+1}});
const jobKey=id=>`AIJOB#${id}`;
const guardKey=key=>`AIBUDGET#GUARD#${key}`;
function validGuard(value,key){if(!value||value.kind!=='budget_guard'||value.budgetKey!==key||value.version!==1)throw new Error('AI budget initialization guard missing or corrupt');return value;}
function validBudget(value){if(!value||!Number.isSafeInteger(value.version)||value.version<1||!Number.isSafeInteger(value.usedMicroUsd)||value.usedMicroUsd<0)throw new Error('AI budget record missing or corrupt');return value;}
function target(room,job,now){if(!room||room.expiresAt<=now||room.createdAt+DAY<=now||room.caseVersion!==job.caseVersion)return null;const player=room.players.find(p=>p.id===job.playerId),interview=player?.interviews.find(i=>i.round===job.round),message=interview?.messages.find(m=>m.id===job.messageId);return message?{player,interview,message}:null;}
function current(room,job,now){const t=target(room,job,now);return t&&room.phase==='investigation'&&room.round===job.round&&!t.interview.closed?t:null;}

// Only explicitly injected by tests/development. Production runtime does not enable this repository.
export class AiJobs {
 constructor({store,policy,now=Date.now}){
  if(!store||!policy||typeof policy.model!=='string'||!policy.model||policy.model.length>100)throw new Error('Explicit AI policy required');
  this.policy={...PROPOSED_LIMITS,...policy};
  for(const key of ['roomMicroUsd','dayMicroUsd','monthMicroUsd','maxConcurrent'])if(!Number.isSafeInteger(this.policy[key])||this.policy[key]<1||this.policy[key]>PROPOSED_LIMITS[key])throw new Error('Invalid proposed AI limit');
  if(this.policy.inputTokens!==2500||this.policy.outputTokens!==350)throw new Error('Unsupported token envelope');
  this.reserve=reserveCost(this.policy);this.store=store;this.now=now;
 }
 async prepareQuestion({room,player,receiptKey,caseData}){
  const interview=player.interviews.find(i=>i.round===room.round),message=interview.messages.at(-1),now=this.now(),date=new Date(now),day=date.toISOString().slice(0,10),month=day.slice(0,7);
  const scopes=[{key:`AIBUDGET#ROOM#${room.code}`,max:this.policy.roomMicroUsd,expiresAt:room.createdAt+8*DAY},{key:`AIBUDGET#DAY#${day}`,max:this.policy.dayMicroUsd,expiresAt:Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+8)},{key:`AIBUDGET#MONTH#${month}`,max:this.policy.monthMicroUsd,expiresAt:Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,8)}];
  let balances,guards;try{[balances,guards]=await Promise.all([Promise.all(scopes.map(s=>this.store.getAi(s.key))),Promise.all(scopes.map(s=>this.store.getAi(guardKey(s.key))))]);for(let i=0;i<scopes.length;i++){if(!!balances[i]!==!!guards[i])throw new Error('AI budget initialization mismatch');if(balances[i]){validBudget(balances[i]);validGuard(guards[i],scopes[i].key);}}}catch{message.narration={status:'fallback'};return [];}
  if(balances.some((b,i)=>(b?.usedMicroUsd??0)+this.reserve>scopes[i].max)){message.narration={status:'fallback'};return [];}
  const id=createHash('sha256').update(`ai:${receiptKey}`).digest('hex'),suspect=caseData.suspects.find(s=>s.id===interview.suspectId),deadline=now+30000,expiresAt=room.createdAt+DAY;
  const job={kind:'job',id,code:room.code,playerId:player.id,round:room.round,messageId:message.id,caseVersion:room.caseVersion,context:{persona:`${suspect.name}. ${suspect.role}. ${suspect.profile}`,canonical:message.answer,question:message.question},model:this.policy.model,rates:{inputRate:this.policy.inputRate,outputRate:this.policy.outputRate},status:'pending',createdAt:now,deadline,expiresAt,dueAt:deadline,reservedMicroUsd:this.reserve,budgetKeys:scopes.map(s=>s.key)};
  message.narration={status:'pending'};
  return [...scopes.filter((s,i)=>!guards[i]).map(s=>write(guardKey(s.key),null,{kind:'budget_guard',budgetKey:s.key,expiresAt:s.expiresAt+DAY})),...scopes.map((s,i)=>write(s.key,balances[i],{kind:'budget',usedMicroUsd:(balances[i]?.usedMicroUsd??0)+this.reserve,expiresAt:s.expiresAt})),write(jobKey(id),null,job),write(`AIOUTBOX#${id}`,null,{kind:'outbox',jobId:id,status:'pending',deadline,expiresAt,dueAt:now})];
 }
 async dispatch(id,send){
  const key=`AIOUTBOX#${id}`,outbox=await this.store.getAi(key);if(!outbox||outbox.status!=='pending')return {status:'not_pending'};
  const job=await this.store.getAi(jobKey(id));if(job&&job.deadline<=this.now())return this.fallback(job,'deadline');
  if(job&&!FINAL.has(job.status))await send({jobId:id});
  return this.retry(async()=>{const fresh=await this.store.getAi(key);if(!fresh||fresh.status!=='pending')return {status:'not_pending'};await this.store.commitAi({writes:[write(key,fresh,{status:job&&!FINAL.has(job.status)?'sent':'done',dueAt:undefined})]});return {status:'sent'};});
 }
 async reconcile({send,limit=25,cursor}={}){
  const page=await this.store.listAiDue(this.now(),limit,cursor);let failed=0,deferFailures=0;
  for(const key of page.keys)try{const record=await this.store.getAi(key);if(!record||!Number.isSafeInteger(record.dueAt)||record.dueAt>this.now())continue;
   if(record.kind==='job'&&!FINAL.has(record.status)&&record.deadline<=this.now())await this.fallback(record,'deadline');
   else if(record.kind==='outbox'&&record.status==='pending')await this.dispatch(record.jobId,send);
  }catch{failed++;try{await this.retry(async()=>{const fresh=await this.store.getAi(key);if(fresh&&Number.isSafeInteger(fresh.dueAt)&&fresh.dueAt<=this.now())await this.store.commitAi({writes:[write(key,fresh,{dueAt:this.now()+60000,lastRecoveryFailureAt:this.now()})]});});}catch{deferFailures++;}}
  return {examined:page.keys.length,failed,deferFailures,cursor:page.cursor};
 }
 async retry(run){for(let i=0;i<8;i++)try{return await run();}catch(e){if(!(e instanceof ConflictError))throw e;}throw new ConflictError();}
 async claim(id){return this.retry(async()=>{
  const job=await this.store.getAi(jobKey(id)),now=this.now();if(!job||FINAL.has(job.status)||job.status==='provider_started'||job.status==='leased'&&job.leaseUntil>now)return null;
  const w=write(jobKey(id),job,{status:'leased',fence:randomUUID(),leaseUntil:now+5000});await this.store.commitAi({writes:[w]});return w.value;
 });}
 async markProviderStarted(claim){return this.retry(async()=>{
  const job=await this.store.getAi(jobKey(claim.id));if(!job||job.status!=='leased'||job.fence!==claim.fence||job.leaseUntil<=this.now()||job.deadline<=this.now())return false;
  const room=await this.store.getRoom(job.code);if(!current(room,job,this.now()))return false;
  const budgetChecks=[];for(const key of job.budgetKeys){const balance=validBudget(await this.store.getAi(key)),guard=validGuard(await this.store.getAi(guardKey(key)),key);if(balance.usedMicroUsd<job.reservedMicroUsd)throw new Error('AI budget invariant violated');budgetChecks.push({key,expectedVersion:balance.version},{key:guardKey(key),expectedVersion:guard.version});}
  const slots=await this.store.getAi('AISLOTS#GLOBAL'),now=this.now();if(job.leaseUntil<=now||job.deadline<=now)return false;
  const active=(slots?.active??[]).filter(s=>s.until>now);if(active.length>=this.policy.maxConcurrent)return false;
  active.push({id:job.id,fence:job.fence,until:now+60000});
  await this.store.commitAi({roomCode:room.code,expectedRoomVersion:room.version,checks:budgetChecks,writes:[write(jobKey(job.id),job,{status:'provider_started',providerStartedAt:now}),write('AISLOTS#GLOBAL',slots,{kind:'slots',active,expiresAt:now+8*DAY})]});return true;
 });}
 async complete(claim,{voice,actualMicroUsd}){
  if(typeof voice!=='string'||!voice.trim()||Buffer.byteLength(voice)>1200||!Number.isSafeInteger(actualMicroUsd)||actualMicroUsd<0)throw new Error('Invalid provider completion');
  return this.settle(claim,{voice,actualMicroUsd});
 }
 async fallback(claim,reason,{costUncertain=false}={}){return this.settle(claim,{reason,costUncertain});}
 async settle(claim,result){return this.retry(async()=>{
  const job=await this.store.getAi(jobKey(claim.id));if(!job)return {status:'missing'};if(FINAL.has(job.status))return {status:job.status};if(claim.fence!==job.fence)return {status:'stale'};
  const now=this.now(),room=await this.store.getRoom(job.code),visible=current(room,job,now),started=job.status==='provider_started';
  if(result.voice&&!started)return {status:'stale'};
  const completed=!!result.voice&&!!visible&&now<job.deadline;
  if(result.actualMicroUsd>job.reservedMicroUsd)throw new Error('Provider cost exceeds reservation');
  const uncertain=started&&!completed||!!result.costUncertain;
  const charge=completed?result.actualMicroUsd:uncertain?job.reservedMicroUsd:0,refund=job.reservedMicroUsd-charge;
  const balances=await Promise.all(job.budgetKeys.map(k=>this.store.getAi(k)));for(const key of job.budgetKeys)validGuard(await this.store.getAi(guardKey(key)),key);for(const b of balances){validBudget(b);if(b.usedMicroUsd<job.reservedMicroUsd)throw new Error('AI budget invariant violated');}
  const writes=job.budgetKeys.map((k,i)=>write(k,balances[i],{usedMicroUsd:balances[i].usedMicroUsd-refund}));
  const finished={status:completed?'complete':'fallback',settledMicroUsd:charge,costUncertain:uncertain,finishedAt:now,reason:completed?null:result.reason??'stale_or_late',dueAt:undefined};
  writes.push(write(jobKey(job.id),job,finished));
  const outbox=await this.store.getAi(`AIOUTBOX#${job.id}`);if(outbox)writes.push(write(`AIOUTBOX#${job.id}`,outbox,{status:'done',dueAt:undefined}));
  const slots=await this.store.getAi('AISLOTS#GLOBAL');if(slots&&!uncertain)writes.push(write('AISLOTS#GLOBAL',slots,{active:slots.active.filter(s=>s.id!==job.id)}));
  const t=target(room,job,now);let changedRoom;if(t){t.message.narration=completed?{status:'complete',text:result.voice}:{status:'fallback'};room.version++;changedRoom=room;}
  await this.store.commitAi({writes,room:changedRoom,roomCode:room?.code,expectedRoomVersion:room?room.version-(changedRoom?1:0):null});return {status:finished.status};
 });}
}
