import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateCase,validateCaseLibrary} from '../server/case-loader.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {GameService} from '../server/game.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
import {caseData as museum,catalog as museumCatalog} from '../examples/public-demo.mjs';
const second={...structuredClone(TRAIN_CASE),id:'other',version:'second-v1',title:'Other synthetic case',culpritId:'suspect-4',clockStart:'09:30',solution:{...TRAIN_CASE.solution,motive:'OTHER PRIVATE MOTIVE'}};
second.suspects[0].responses.clue='OTHER PRIVATE CLUE';second.suspects[0].brief='OTHER PRIVATE BRIEF';
const catalog=[...CASES,{id:'other',title:second.title,available:true}];
const input=()=>({cases:[TRAIN_CASE,second],catalog});
const data=()=>validateCaseLibrary(input());
const action=(type,extra={})=>({id:randomUUID(),type,...extra});
async function room(game,caseId,n=3){const players=Array.from({length:n},()=>randomUUID());const created=await game.create(players[0],'Host',caseId,randomUUID());for(let i=1;i<n;i++)await game.join(created.code,players[i],`Agent ${i}`,randomUUID());return {code:created.code,players};}
async function play(game,r,culprit){await game.act(r.code,r.players[0],action('start'));for(let round=1;round<=4;round++)for(const session of r.players){await game.act(r.code,session,action('select',{round,suspectId:'suspect-0'}));for(const question of ['Where were you?','What did you notice?','What is your motive?'])await game.act(r.code,session,action('ask',{round,question}));}for(const [i,session] of r.players.entries())await game.act(r.code,session,action('vote',{suspectId:typeof culprit==='function'?culprit(i):culprit}));return game.view(r.code,r.players[0]);}

test('library validates catalog coverage, identity, revisions and spoiler-free fields',()=>{
 const d=data();assert.equal(d.registry.current.size,2);assert.deepEqual(d.catalog,catalog);
 assert.throws(()=>validateCaseLibrary({...input(),cases:[TRAIN_CASE,TRAIN_CASE]}),/unique/);
 assert.throws(()=>validateCaseLibrary({...input(),cases:[TRAIN_CASE]}),/no current case/);
 assert.throws(()=>validateCaseLibrary({...input(),catalog:[...catalog,{id:'leak',title:'Leak',available:false,solution:'secret'}]}),/unsupported/);
 assert.throws(()=>validateCaseLibrary({...input(),defaultCaseId:'absent'}),/defaultCaseId/);
 assert.throws(()=>validateCaseLibrary({...input(),archivedCases:[TRAIN_CASE]}),/unique revisions/);
 const cyclic=input();cyclic.PRIVATE_CYCLE_LABEL=cyclic;assert.throws(()=>validateCaseLibrary(cyclic),e=>e.message==='library: expected JSON-serializable content');
});

test('selection routes concurrent rooms to their own answers, clocks, reveals and private deductions',async()=>{
 const game=new DurableGame({store:new MemoryStore(),...data()});const a=await room(game,'demo'),b=await room(game,'other',4);
 for(const r of [a,b]){const state=await game.view(r.code,r.players[0]);assert.equal(state.case.id,r===a?'demo':'other');assert.ok(!JSON.stringify(state).includes('PRIVATE'));assert.equal(state.suspects.length,15);}
 const [ra,rb]=await Promise.all([play(game,a,'suspect-0'),play(game,b,'suspect-4')]);
 assert.equal(ra.result.outcome,'complete');assert.equal(rb.result.outcome,'complete');assert.equal(ra.result.culpritId,'suspect-0');assert.equal(rb.result.culpritId,'suspect-4');
 assert.equal(rb.result.solution.motive,'OTHER PRIVATE MOTIVE');assert.notEqual(ra.result.solution.motive,rb.result.solution.motive);
 assert.equal(rb.clock.crimeAt,'09:30');assert.ok(rb.me.interviews[0].messages.some(m=>m.reply==='OTHER PRIVATE CLUE'));
 assert.ok(!JSON.stringify(ra).includes('OTHER PRIVATE'));
 await assert.rejects(()=>game.view(a.code,b.players[0]),/session/);
});

test('partial and defeat use selected-case truth',async()=>{
 for(const [votes,outcome] of [[i=>i===0?'suspect-4':'suspect-0','partial'],[()=> 'suspect-0','defeat']]){
 const game=new DurableGame({store:new MemoryStore(),...data()});const r=await room(game,'other');assert.equal((await play(game,r,votes)).result.outcome,outcome);}
});

test('legacy museum pin stays byte-for-byte compatible across library rollout and restarts',async()=>{
 const store=new MemoryStore(),legacy=validateCase({caseData:museum,catalog:museumCatalog});const old=new DurableGame({store,...legacy});const r=await room(old,museum.id);await old.act(r.code,r.players[0],action('start'));
 const before=await store.getRoom(r.code);const library=validateCaseLibrary({cases:[museum,second],catalog:[...museumCatalog,{id:second.id,title:second.title,available:true}]});
 assert.equal(library.registry.current.get(museum.id).version,legacy.caseData.version);
 const next=new DurableGame({store,...library});assert.deepEqual(await next.view(r.code,r.players[0]),await old.view(r.code,r.players[0]));
 await next.act(r.code,r.players[0],action('select',{round:1,suspectId:museum.suspects[0].id}));await next.act(r.code,r.players[0],action('ask',{round:1,question:'Where were you?'}));
 const after=await store.getRoom(r.code);assert.equal(after.caseVersion,before.caseVersion);assert.equal(after.schemaVersion,before.schemaVersion);
});

test('revisions pin active rooms while new rooms select updated truth; missing old revision fails closed',async()=>{
 const store=new MemoryStore(),old=new DurableGame({store,...data()});const r=await room(old,'demo');const changed={...TRAIN_CASE,version:'v2',title:'Updated synthetic case'};
 const updated=validateCaseLibrary({cases:[changed,second],archivedCases:[TRAIN_CASE],catalog});const next=new DurableGame({store,...updated});
 assert.equal((await next.view(r.code,r.players[0])).case.title,TRAIN_CASE.title);const newer=await room(next,'demo');assert.equal((await next.view(newer.code,newer.players[0])).case.title,changed.title);
 await next.act(r.code,r.players[0],action('start'));assert.equal((await store.getRoom(r.code)).caseVersion,data().caseData.version);
 const broken=new DurableGame({store,...validateCaseLibrary({cases:[changed,second],catalog})});await assert.rejects(()=>broken.view(r.code,r.players[0]),/version unavailable/);
});

test('AI admission receives selected private case; other players and rooms never see it',async()=>{
 const captured=[];const game=new DurableGame({store:new MemoryStore(),...data(),ai:{prepareQuestion:async p=>{captured.push(p);return [];}}});const r=await room(game,'other');await game.act(r.code,r.players[0],action('start'));await game.act(r.code,r.players[0],action('select',{round:1,suspectId:'suspect-0'}));await game.act(r.code,r.players[0],action('ask',{round:1,question:'What did you notice?'}));
 assert.equal(captured[0].caseData.id,'other');assert.equal(captured[0].room.caseVersion,captured[0].caseData.version);assert.equal(captured[0].caseData.suspects[0].brief,'OTHER PRIVATE BRIEF');
 const other=await game.view(r.code,r.players[1]);assert.equal(other.me.interviews.length,0);assert.equal(other.me.deductions.length,0);assert.ok(!JSON.stringify(other).includes('OTHER PRIVATE'));
});

test('in-memory service also pins separate selected cases and rejects unavailable IDs',()=>{
 const game=new GameService(data());const a=game.create('One','demo',randomUUID()),b=game.create('Two','other',randomUUID());assert.equal(a.state.case.id,'demo');assert.equal(b.state.case.id,'other');assert.throws(()=>game.create('X','missing',randomUUID()),/not available/);
});

test('in-flight legacy AI job settles against its original museum pin after rollout',async()=>{
 const {AiJobs}=await import('../server/ai/jobs.mjs');const {runJob}=await import('../server/ai/worker.mjs');const {policy,fakeProvider}=await import('./helpers/ai.mjs');
 const store=new MemoryStore(),jobs=new AiJobs({store,policy}),legacy=validateCase({caseData:museum,catalog:museumCatalog});
 const old=new DurableGame({store,...legacy,ai:jobs});const r=await room(old,museum.id);await old.act(r.code,r.players[0],action('start'));
 await old.act(r.code,r.players[0],action('select',{round:1,suspectId:museum.suspects[0].id}));await old.act(r.code,r.players[0],action('ask',{round:1,question:'Where were you?'}));
 const job=[...store.ai.values()].find(j=>j.kind==='job');assert.ok(job);assert.equal(job.caseVersion,legacy.caseData.version);
 const next=new DurableGame({store,...validateCaseLibrary({cases:[museum,second],catalog:[...museumCatalog,{id:second.id,title:second.title,available:true}]}),ai:jobs});
 await runJob({enabled:true,jobId:job.id,repository:jobs,provider:fakeProvider({reply:'A synthetic legacy reply.',unlocked:[]})});
 const state=await next.view(r.code,r.players[0]);assert.equal(state.me.interviews[0].messages[0].reply,'A synthetic legacy reply.');assert.equal(state.me.interviews[0].messages[0].status,'complete');
 assert.equal((await next.view(r.code,r.players[1])).me.interviews.length,0);
});

test('offline library preflight reports aggregate checks without narrative contents',async()=>{
 const {checkLibrary}=await import('../scripts/check-library.mjs');const report=await checkLibrary(data());assert.equal(report.completeSessions,4);assert.equal(report.paidCalls,0);assert.ok(report.reports.every(r=>r.aiContextsChecked===60&&r.preflight.canonicalAnswersChecked===60));assert.ok(!JSON.stringify(report).includes('PRIVATE'));assert.ok(report.reports.every(r=>r.sessions.every(s=>s.questions===s.players*12)));
});
