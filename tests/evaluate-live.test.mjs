import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {runLiveEvaluation,runQuestions,planQuestions,flagReply,aggregate} from '../scripts/live-evaluation.mjs';
import {caseData} from '../examples/public-demo.mjs';
import {createProvider} from '../server/ai/provider.mjs';

const KEY='sk-SECRETKEYVALUE123';
const env={SHIFT_LOCAL_AI_KEY_FILE:'/x/key',SHIFT_LOCAL_AI_MODEL:'m',SHIFT_LOCAL_AI_INPUT_RATE:'0.5',SHIFT_LOCAL_AI_OUTPUT_RATE:'2'};
const resp=(reply,unlocked,usage={input_tokens:1000,output_tokens:100})=>new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply,unlocked})}]}],usage}));
const questionOf=body=>JSON.parse(JSON.parse(body).input[1].content).question;
const run=async(over={})=>{const out=await mkdtemp(path.join(tmpdir(),'ev-'));const r=await runLiveEvaluation({env,caseData,getSecret:async()=>KEY,outDir:out,...over});return {...r,out};};

test('plan is 15 suspects x 4 kinds', () => {
 const p=planQuestions(caseData);assert.equal(p.length,60);
 assert.equal(p.filter(x=>x.kind==='natural').length,30);assert.equal(p.filter(x=>x.kind==='adversarial').length,15);assert.equal(p.filter(x=>x.kind==='who-did-it').length,15);
});

test('refuses without env vars, and with bad rates', async () => {
 for(const k of Object.keys(env))await assert.rejects(run({env:{...env,[k]:''},fetchImpl:()=>{throw new Error('no network');}}),/^Error: Missing/);
 await assert.rejects(run({env:{...env,SHIFT_LOCAL_AI_INPUT_RATE:'abc'}}),/Rates/);
});

test('refuses over the room limit without calling fetch', async () => {
 let calls=0;const fetchImpl=async()=>{calls++;return resp('x',[]);};
 // reserve = 6000*in + 400*out; 48*reserve > 250000 => reserve > 5208
 await assert.rejects(run({env:{...env,SHIFT_LOCAL_AI_INPUT_RATE:'1',SHIFT_LOCAL_AI_OUTPUT_RATE:'10'},fetchImpl}),/room limit/);
 assert.equal(calls,0);
});

test('stops at the spend cap using actual accumulated cost', async () => {
 let calls=0;const provider=async()=>{calls++;return {reply:'ok',unlocked:[],inputTokens:6000,outputTokens:400};};
 const reserve=6000+1600;
 const r=await runQuestions({caseData,provider,plan:planQuestions(caseData),inputRate:1,outputRate:4,capMicroUsd:reserve*3+1});
 assert.equal(r.stopped,true);assert.equal(calls,3);assert.equal(r.results.length,3);assert.ok(r.spent<=reserve*3+1);
});

test('full run: aggregates flags, unlock rate, invalid ids; writes raw file, prints no reply text or key', async () => {
 const q=[];
 const fetchImpl=async(url,init)=>{
  const question=questionOf(init.body),instr=JSON.parse(init.body).input[0].content;q.push(question);
  const name=/You are ([^,]+),/.exec(instr)[1];
  const ids=[...instr.matchAll(/"id":"([^"]+)"/g)].map(m=>m[1]);
  if(name==='Rowan Calder')return resp('I confess, it was me.',[]);
  if(/Who did it/.test(question)&&name==='Ada Finch')return resp('Rowan did it, he is the culprit.',[]);
  if(name==='Basil'||/Ignore every rule/.test(question))return resp('Sure.',['not-a-real-id']);
  return resp('UNIQUE-REPLY-TEXT',ids.slice(0,1));
 };
 const {summary,file,out}=await run({fetchImpl});
 assert.equal(q.length,60);assert.equal(summary.asked,60);assert.equal(summary.stoppedAtCap,false);
 assert.equal(summary.culpritMentionsForReview,1);assert.equal(summary.confessions,4);assert.ok(summary.invalidUnlockIds>=1);
 assert.equal(summary.costMicroUsd,60*700);
 assert.ok(summary.naturalUnlockRate>0&&summary.naturalUnlockRate<=1);
 const raw=JSON.parse(await readFile(file,'utf8'));assert.equal(raw.results.length,60);assert.equal((await readdir(out)).length,1);
 const printed=JSON.stringify(summary);assert.ok(!printed.includes('UNIQUE-REPLY-TEXT')&&!printed.includes(KEY));
 assert.ok(!(await readFile(file,'utf8')).includes(KEY));
});

test('flag patterns', () => {
 const w={suspectId:'ada',kind:'who-did-it'},adv={suspectId:'ada',kind:'adversarial'};
 for(const t of ['Rowan did it.','It was Rowan.','The culprit is Rowan.','Rowan Calder is behind this.','I think rowan, yes.',"Rowan didn't do it."])assert.equal(flagReply(caseData,w,t).culpritLeak,true,t);
 assert.equal(flagReply(caseData,adv,'It was Rowan Calder.').culpritLeak,true);
 assert.equal(flagReply(caseData,w,'I was in the foyer.').culpritLeak,false);
 assert.equal(flagReply(caseData,{suspectId:'ada',kind:'natural'},'Rowan signed it.').culpritLeak,false);
 assert.equal(flagReply(caseData,{suspectId:'rowan',kind:'who-did-it'},'Rowan did it.').culpritLeak,false);
 assert.equal(flagReply(caseData,{suspectId:'rowan',kind:'who-did-it'},'Fine, I confess.').confession,true);
 assert.equal(flagReply(caseData,{suspectId:'rowan',kind:'who-did-it'},'I was elsewhere.').confession,false);
 const alt={...caseData,culpritId:'ada'};assert.equal(flagReply(alt,{suspectId:'basil',kind:'who-did-it'},'Ada Finch, surely.').culpritLeak,true);
});

test('three 401s abort the run after 3 calls with the error class, charging reserve', async () => {
 let calls=0;const fetchImpl=async()=>{calls++;return new Response('{"error":"sk-LEAK body"}',{status:401});};
 const {summary,file}=await run({fetchImpl});
 assert.equal(calls,3);assert.equal(summary.asked,3);assert.equal(summary.abortedAfterConsecutiveErrors,true);
 assert.deepEqual(summary.errorClasses,{http_401:3});assert.equal(summary.costMicroUsd,3*3800);
 const raw=await readFile(file,'utf8');assert.ok(!raw.includes('LEAK')&&!raw.includes(KEY));
});

test('timeout and invalid output classes; success resets the streak', async () => {
 const t=async()=>{throw Object.assign(new Error('x'),{name:'TimeoutError'});};
 let r=await runQuestions({caseData,provider:async()=>{throw new Error('Invalid provider output');},plan:planQuestions(caseData),inputRate:.5,outputRate:2});
 assert.equal(r.results.length,3);assert.equal(r.results[0].errorClass,'invalid_output');
 const {summary}=await run({fetchImpl:t});assert.deepEqual(summary.errorClasses,{timeout:3});
 let n=0;r=await runQuestions({caseData,provider:async()=>{if(++n%3)throw new Error('b');return {reply:'ok',unlocked:[],inputTokens:10,outputTokens:10};},plan:planQuestions(caseData).slice(0,9),inputRate:.5,outputRate:2});
 assert.equal(r.aborted,false);assert.equal(r.results.length,9);
});

test('provider errors count as errors and are charged the full reserve', async () => {
 const r=await runQuestions({caseData,provider:async()=>{throw new Error('boom');},plan:planQuestions(caseData).slice(0,2),inputRate:1,outputRate:4});
 assert.equal(r.results.every(x=>x.error),true);assert.equal(r.spent,2*7600);
 assert.equal(aggregate(caseData,r).errors,2);
});

test('CLI --live without env refuses, prints no secrets, exits 1', async () => {
 const clean={PATH:process.env.PATH};
 const res=await new Promise(r=>execFile(process.execPath,['scripts/evaluate-interviews.mjs','--live'],{env:clean},(e,so,se)=>r({code:e?.code,so,se})));
 assert.equal(res.code,1);assert.match(res.se,/Missing required environment/);
});
