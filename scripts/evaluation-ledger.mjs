// Paid evaluation only: this file never reads credentials or calls a provider.
// Persist reservations BEFORE sending requests. Interrupted or uncertain calls keep
// their full charge; do not delete a ledger or lock to manufacture fresh budget.
import {open,readFile,lstat,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const FORMAT=1,MAX_FILE_BYTES=4_000_000;
const META_KEYS=['runId','variant','scenarioId','questionId','model','sourceRevision'];
const REASONS=['timeout','provider_error','invalid_output','interrupted','uncertain'];
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const positive=n=>integer(n)&&n>0;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,allowed)=>object(x)&&Object.keys(x).every(k=>allowed.includes(k));
const label=x=>typeof x==='string'&&x.length>0&&x.length<=128&&/^[A-Za-z0-9_.:/-]+$/.test(x)&&!/^sk-/i.test(x);
const instant=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x));
function validateMetadata(metadata){
 if(!keys(metadata,META_KEYS)||!Object.values(metadata).every(label))throw new Error('Invalid evaluation metadata');
 return {...metadata};
}
function validateRates(rates){
 if(!keys(rates,['inputRate','outputRate'])||!Object.values(rates).every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)||Object.keys(rates).length!==2)throw new Error('Explicit positive token rates required');
 return {...rates};
}
function validateReceipt(receipt){
 if(!keys(receipt,['inputTokens','outputTokens'])||!positive(receipt.inputTokens)||!positive(receipt.outputTokens))throw new Error('Verified usage receipt required');
 return {...receipt};
}
function validPath(filename){
 if(typeof filename!=='string'||!path.isAbsolute(filename)||path.resolve(filename)!==filename)throw new Error('Absolute evaluation ledger path required');
 return filename;
}
function validate(state,expectedCap,expectedRates){
 if(!keys(state,['format','capMicroUsd','rates','createdAt','entries'])||state.format!==FORMAT||!positive(state.capMicroUsd)||!instant(state.createdAt)||!Array.isArray(state.entries))throw new Error('Invalid evaluation ledger');
 if(expectedCap!==undefined&&state.capMicroUsd!==expectedCap)throw new Error('Evaluation ledger cap mismatch');
 validateRates(state.rates);
 if(expectedRates&&(state.rates.inputRate!==expectedRates.inputRate||state.rates.outputRate!==expectedRates.outputRate))throw new Error('Evaluation ledger rates mismatch');
 const seen=new Set();let charged=0;
 for(const [index,e] of state.entries.entries()){
  if(!keys(e,['sequence','id','reservedMicroUsd','status','createdAt','metadata','actualMicroUsd','settledAt','receipt','reason'])||e.sequence!==index+1||!label(e.id)||seen.has(e.id)||!positive(e.reservedMicroUsd)||!instant(e.createdAt))throw new Error('Invalid evaluation ledger entry');
  validateMetadata(e.metadata);seen.add(e.id);
  if(e.status==='reserved'){
   if(['actualMicroUsd','settledAt','receipt','reason'].some(k=>Object.hasOwn(e,k)))throw new Error('Invalid pending reservation');
   charged+=e.reservedMicroUsd;
  }else if(e.status==='settled'){
   if(!integer(e.actualMicroUsd)||e.actualMicroUsd>e.reservedMicroUsd||!instant(e.settledAt)||Object.hasOwn(e,'reason'))throw new Error('Invalid settled reservation');
   validateReceipt(e.receipt);
   if(e.actualMicroUsd!==Math.ceil(e.receipt.inputTokens*state.rates.inputRate+e.receipt.outputTokens*state.rates.outputRate))throw new Error('Receipt cost mismatch');
   charged+=e.actualMicroUsd;
  }else if(e.status==='uncertain'){
   if(!instant(e.settledAt)||!REASONS.includes(e.reason)||['actualMicroUsd','receipt'].some(k=>Object.hasOwn(e,k)))throw new Error('Invalid uncertain reservation');
   charged+=e.reservedMicroUsd;
  }else throw new Error('Invalid reservation status');
  if(!integer(charged)||charged>state.capMicroUsd)throw new Error('Evaluation ledger exceeds cap');
 }
 return state;
}
function snapshot(state){
 const copy=structuredClone(state);
 const actualMicroUsd=state.entries.reduce((sum,e)=>sum+(e.status==='settled'?e.actualMicroUsd:0),0);
 const reservedMicroUsd=state.entries.reduce((sum,e)=>sum+(e.status==='reserved'?e.reservedMicroUsd:0),0);
 const uncertainMicroUsd=state.entries.reduce((sum,e)=>sum+(e.status==='uncertain'?e.reservedMicroUsd:0),0);
 const chargedMicroUsd=actualMicroUsd+reservedMicroUsd+uncertainMicroUsd;
 return {...copy,actualMicroUsd,reservedMicroUsd,uncertainMicroUsd,chargedMicroUsd,remainingMicroUsd:state.capMicroUsd-chargedMicroUsd};
}
async function readState(filename,cap,rates){
 const info=await lstat(filename);
 if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_FILE_BYTES)throw new Error('Invalid evaluation ledger file');
 let state;try{state=JSON.parse(await readFile(filename,'utf8'));}catch{throw new Error('Unreadable evaluation ledger');}
 return validate(state,cap,rates);
}
async function locked(filename,action){
 // Never reclaim a stale lock automatically: a previous process may have sent a
 // paid request. A lock error means no action in this attempt was executed.
 const lockfile=filename+'.lock';let lock;
 try{lock=await open(lockfile,'wx',0o600);}catch{throw new Error('Evaluation ledger locked or unavailable');}
 try{await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));await lock.sync();return await action();}
 finally{await lock.close();await unlink(lockfile);}
}
async function writeState(filename,state,{initial=false}={}){
 validate(state);const text=JSON.stringify(state,null,2)+'\n';
 if(Buffer.byteLength(text)>MAX_FILE_BYTES)throw new Error('Evaluation ledger too large');
 if(initial){
  // Exclusive creation cannot replace an existing ledger. A crash during first
  // write leaves an invalid file which must fail closed on every later open.
  const file=await open(filename,'wx',0o600);try{await file.writeFile(text);await file.sync();}finally{await file.close();}
  return;
 }
 const temporary=filename+'.'+randomUUID()+'.tmp';let file;
 try{
  file=await open(temporary,'wx',0o600);await file.writeFile(text);await file.sync();await file.close();file=null;
  await rename(temporary,filename); // Same-directory atomic replacement, also on Windows.
 }finally{await file?.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
function api(filename,cap,rates){
 const change=action=>locked(filename,async()=>{
  const state=await readState(filename,cap,rates);const result=action(state);await writeState(filename,state);return result;
 });
 return Object.freeze({
  snapshot:async()=>snapshot(await readState(filename,cap,rates)),
  reserve:async(id,reservedMicroUsd,metadata={})=>{
   if(!label(id)||!positive(reservedMicroUsd))throw new Error('Invalid reservation');
   const clean=validateMetadata(metadata);
   return change(state=>{
    if(state.entries.some(e=>e.id===id))throw new Error('Reservation id already exists');
    if(reservedMicroUsd>snapshot(state).remainingMicroUsd)throw new Error('Evaluation budget exhausted');
    const entry={sequence:state.entries.length+1,id,reservedMicroUsd,status:'reserved',createdAt:new Date().toISOString(),metadata:clean};
    state.entries.push(entry);return structuredClone(entry);
   });
  },
  settle:async(id,actualMicroUsd,receipt)=>{
   if(!label(id)||!integer(actualMicroUsd))throw new Error('Invalid settlement');const clean=validateReceipt(receipt);
   return change(state=>{
    const entry=state.entries.find(e=>e.id===id);
    if(!entry||entry.status!=='reserved')throw new Error('Reservation is not pending');
    if(actualMicroUsd>entry.reservedMicroUsd)throw new Error('Actual cost exceeds reservation');
    if(actualMicroUsd!==Math.ceil(clean.inputTokens*state.rates.inputRate+clean.outputTokens*state.rates.outputRate))throw new Error('Receipt cost mismatch');
    Object.assign(entry,{status:'settled',actualMicroUsd,settledAt:new Date().toISOString(),receipt:clean});return structuredClone(entry);
   });
  },
  markUncertain:async(id,{reason='uncertain'}={})=>{
   if(!label(id)||!REASONS.includes(reason))throw new Error('Invalid uncertainty reason');
   return change(state=>{
    const entry=state.entries.find(e=>e.id===id);
    if(!entry||entry.status!=='reserved')throw new Error('Reservation is not pending');
    Object.assign(entry,{status:'uncertain',settledAt:new Date().toISOString(),reason});return structuredClone(entry);
   });
  }
 });
}
export async function createLedger(filename,{capMicroUsd,rates}={}){
 validPath(filename);if(!positive(capMicroUsd))throw new Error('Explicit positive evaluation cap required');rates=validateRates(rates);
 await locked(filename,()=>writeState(filename,{format:FORMAT,capMicroUsd,rates,createdAt:new Date().toISOString(),entries:[]},{initial:true}));
 return api(filename,capMicroUsd,rates);
}
export async function openLedger(filename,{capMicroUsd,rates}={}){
 validPath(filename);if(!positive(capMicroUsd))throw new Error('Expected positive evaluation cap required');rates=validateRates(rates);
 await readState(filename,capMicroUsd,rates);return api(filename,capMicroUsd,rates);
}
