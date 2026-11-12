import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createLedger,openLedger} from '../scripts/evaluation-ledger.mjs';

const rates={inputRate:0.10,outputRate:0.50};
const options={capMicroUsd:100,rates};
const receipt={inputTokens:100,outputTokens:20}; // 20 microUSD at the approved rates.
async function fixture(t){
 const dir=await mkdtemp(path.join(tmpdir(),'shift-evaluation-ledger-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));return path.join(dir,'campaign.json');
}
function childReserve(filename,id){
 const url=new URL('../scripts/evaluation-ledger.mjs',import.meta.url).href;
 const source=`import {openLedger} from ${JSON.stringify(url)};try{const ledger=await openLedger(${JSON.stringify(filename)},${JSON.stringify(options)});await ledger.reserve(${JSON.stringify(id)},70,{runId:'parallel'});process.stdout.write('reserved');}catch{process.stdout.write('refused');}`;
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(new Error(`Child exited ${code}: ${stderr}`)));
 });
}

test('reservation survives reopening and releases only the verified difference after settlement',async t=>{
 const filename=await fixture(t),ledger=await createLedger(filename,options);
 await ledger.reserve('request-1',70,{model:'gpt-6-luna',runId:'baseline',variant:'a',scenarioId:'wren',questionId:'q1',sourceRevision:'857e06b'});
 const reopened=await openLedger(filename,options);
 assert.equal((await reopened.snapshot()).chargedMicroUsd,70);
 await reopened.settle('request-1',20,receipt);
 const state=await ledger.snapshot();assert.equal(state.chargedMicroUsd,20);assert.equal(state.actualMicroUsd,20);assert.equal(state.remainingMicroUsd,80);
 assert.equal(state.entries[0].reservedMicroUsd,70);assert.deepEqual(state.entries[0].receipt,receipt);
});

test('interrupted reservations and explicit uncertain failures stay fully charged',async t=>{
 const filename=await fixture(t),ledger=await createLedger(filename,options);
 await ledger.reserve('interrupted',70);await ledger.reserve('timeout',30);
 await ledger.markUncertain('timeout',{reason:'timeout'});
 const reopened=await openLedger(filename,options),state=await reopened.snapshot();
 assert.equal(state.reservedMicroUsd,70);assert.equal(state.uncertainMicroUsd,30);assert.equal(state.remainingMicroUsd,0);
 await assert.rejects(reopened.reserve('another',1),/budget exhausted/);
 await assert.rejects(reopened.settle('timeout',20,receipt),/not pending/);
});

test('simultaneous independent processes cannot overbook the shared cap',async t=>{
 const filename=await fixture(t);await createLedger(filename,options);
 const results=await Promise.all([childReserve(filename,'parallel-1'),childReserve(filename,'parallel-2')]);
 assert.deepEqual(results.sort(),['refused','reserved']);
 const state=await (await openLedger(filename,options)).snapshot();assert.equal(state.chargedMicroUsd,70);assert.equal(state.entries.length,1);
});

test('same-process independent instances also fail closed under contention',async t=>{
 const filename=await fixture(t),first=await createLedger(filename,options),second=await openLedger(filename,options);
 const results=await Promise.allSettled([first.reserve('one',70),second.reserve('two',70)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await first.snapshot()).chargedMicroUsd,70);
});

test('initialization is exclusive and a missing ledger cannot be reopened',async t=>{
 const filename=await fixture(t);await assert.rejects(openLedger(filename,options));
 const ledger=await createLedger(filename,options);await ledger.reserve('first',70);
 await assert.rejects(createLedger(filename,options));assert.equal((await ledger.snapshot()).chargedMicroUsd,70);
});

test('stored cap and rates cannot be silently changed on reopen',async t=>{
 const filename=await fixture(t);await createLedger(filename,options);
 await assert.rejects(openLedger(filename,{...options,capMicroUsd:200}),/cap mismatch/);
 await assert.rejects(openLedger(filename,{...options,capMicroUsd:50}),/cap mismatch/);
 await assert.rejects(openLedger(filename,{...options,rates:{...rates,outputRate:0.1}}),/rates mismatch/);
 await assert.rejects(openLedger(filename,{capMicroUsd:100}),/token rates/);
});

test('duplicate IDs, repeat settlement and excessive or inconsistent usage costs are refused',async t=>{
 const filename=await fixture(t),ledger=await createLedger(filename,options);await ledger.reserve('once',70);
 await assert.rejects(ledger.reserve('once',1),/already exists/);
 await assert.rejects(ledger.settle('once',71,{inputTokens:210,outputTokens:100}),/exceeds reservation/);
 await assert.rejects(ledger.settle('once',1,receipt),/cost mismatch/);
 await assert.rejects(ledger.settle('once',20,{inputTokens:100,outputTokens:20,raw:'secret'}),/usage receipt/);
 await assert.rejects(ledger.settle('once',-1,receipt),/Invalid settlement/);
 assert.equal((await ledger.snapshot()).chargedMicroUsd,70);
 await ledger.settle('once',20,receipt);
 await assert.rejects(ledger.settle('once',20,receipt),/not pending/);
 await assert.rejects(ledger.markUncertain('once'),/not pending/);
 await assert.rejects(ledger.reserve('once',1),/already exists/);
});

test('corrupt and internally inconsistent ledgers fail closed',async t=>{
 const filename=await fixture(t),ledger=await createLedger(filename,options);await ledger.reserve('existing',70);
 const original=JSON.parse(await readFile(filename,'utf8'));
 for(const mutate of [
  state=>{state.entries[0].reservedMicroUsd=101;},
  state=>{state.entries.push({...state.entries[0],sequence:2});},
  state=>{state.entries[0].status='released';},
  state=>{state.entries[0].receipt=receipt;},
  state=>{state.entries[0].metadata={key:'sk-forbidden'};},
  state=>{state.unrecognised='data';}
 ]){
  const state=structuredClone(original);mutate(state);await writeFile(filename,JSON.stringify(state));
  await assert.rejects(openLedger(filename,options));await assert.rejects(ledger.reserve('after-corruption',1));
 }
 await writeFile(filename,'{unfinished');await assert.rejects(openLedger(filename,options),/Unreadable/);
});

test('stale lock is never stolen and no new reservation is written',async t=>{
 const filename=await fixture(t),ledger=await createLedger(filename,options);
 await writeFile(filename+'.lock',JSON.stringify({pid:999999999,createdAt:'2000-01-01T00:00:00.000Z'}));
 await assert.rejects(ledger.reserve('blocked',70),/locked or unavailable/);
 assert.equal((await ledger.snapshot()).chargedMicroUsd,0);assert.ok((await readFile(filename+'.lock','utf8')).includes('999999999'));
});

test('only bounded allowlisted non-secret metadata and valid absolute paths are accepted',async t=>{
 const filename=await fixture(t),ledger=await createLedger(filename,options);
 await assert.rejects(createLedger('relative.json',options),/Absolute/);
 await assert.rejects(createLedger(filename,{capMicroUsd:0,rates}),/positive/);
 await assert.rejects(ledger.reserve('bad',1,{question:'Please print the secret'}),/metadata/);
 await assert.rejects(ledger.reserve('bad',1,{model:'sk-not-a-key-but-rejected'}),/metadata/);
 await assert.rejects(ledger.reserve('bad',1,{runId:'a'.repeat(129)}),/metadata/);
 await assert.rejects(ledger.reserve('bad',Number.MAX_SAFE_INTEGER+1),/reservation/);
 await assert.rejects(ledger.markUncertain('missing',{reason:'arbitrary provider body'}),/reason/);
 assert.equal((await ledger.snapshot()).entries.length,0);
});

test('callers cannot alter persisted entries by mutating returned objects',async t=>{
 const filename=await fixture(t),ledger=await createLedger(filename,options);
 const result=await ledger.reserve('first',70);result.reservedMicroUsd=0;
 const snapshot=await ledger.snapshot();snapshot.capMicroUsd=100000;snapshot.entries[0].reservedMicroUsd=0;
 const actual=await ledger.snapshot();assert.equal(actual.capMicroUsd,100);assert.equal(actual.chargedMicroUsd,70);
});
