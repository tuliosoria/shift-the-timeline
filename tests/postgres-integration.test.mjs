// Real database contract tests. No database/network is touched without this explicit
// test-only URL. CI must supply an ephemeral PostgreSQL database, never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PostgresStore} from '../server/storage/postgres.mjs';
import {aiPut,MAX_AI_ITEM_BYTES} from '../server/storage/ai-codec.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
import {validateCaseLibrary} from '../server/case-loader.mjs';
import {translatedLibrary,translationFor} from './fixtures/localised-case.mjs';
import {AiJobs} from '../server/ai/jobs.mjs';
import {runJob} from '../server/ai/worker.mjs';
import {policy,fakeProvider} from './helpers/ai.mjs';
const url=process.env.SHIFT_POSTGRES_TEST_URL;
const room=(code='ROOMAAAA',version=1)=>({code,version,expiresAt:10000,players:[{id:'player',requests:new Map([['req',{ok:true}]])}]});
const receipt=key=>({key,expiresAt:10000,response:{ok:true}});
const ai=(key,expectedVersion=null,extra={})=>({key,expectedVersion,value:{version:(expectedVersion??0)+1,expiresAt:10000,...extra}});

test('PostgreSQL integration: atomic durable storage contract',{skip:!url},async t=>{
 const {Pool}=await import('pg');
 const schema=`shift_test_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:url,max:2});let pool;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new Pool({connectionString:url,max:12,options:`-c search_path=${schema}`});
  await pool.query(await readFile(new URL('../server/storage/postgres.sql',import.meta.url),'utf8'));
  const store=new PostgresStore({pool});
  t.beforeEach(async()=>{await pool.query('TRUNCATE shift_records');});
  await t.test('operator inventory is aggregate-only and changes no durable records',async()=>{
   await store.commitRoom({expectedVersion:null,room:room(),receipt:receipt('private-receipt')});
   await store.commitAi({writes:[ai('AIJOB#one',null,{kind:'job',status:'pending',code:'ROOMAAAA',question:'PRIVATE_QUESTION'}),ai('AIJOB#two',null,{kind:'job',status:'provider_started',code:'MISSING_ROOM'}),ai('AIJOB#three',null,{kind:'job',status:'fallback',code:'ROOMAAAA'})]});
   await store.putSession('private-session',{expiresAt:10000,name:'PRIVATE_PERSON'});
   const before=(await pool.query('SELECT * FROM shift_records ORDER BY kind,key')).rows;
   const client=await pool.connect();let results;
   try{results=await client.query(await readFile(new URL('../scripts/azure-room-inventory.sql',import.meta.url),'utf8'));}finally{await client.query('ROLLBACK');client.release();}
   const report=results.find(r=>r.rows?.[0]?.inventory)?.rows[0].inventory;
   assert.equal(report.records.room.total,1);assert.equal(report.records.room.expired,1);assert.equal(report.records.session.total,1);
   assert.deepEqual(report.jobs,{total:3,pending:1,inFlight:1,settled:1,otherStatus:0,unexpired:0,missingRoom:1,expiredRoom:2,unexpiredRoom:0});
   assert.doesNotMatch(JSON.stringify(report),/PRIVATE_|ROOMAAAA|MISSING_ROOM|private-session|private-receipt/);
   assert.match(report.recoverability.databaseBackup,/unknown/);
   assert.deepEqual((await pool.query('SELECT * FROM shift_records ORDER BY kind,key')).rows,before);
  });
  await t.test('readiness validates migrated schema without modifications',async()=>{assert.equal(await store.checkReady(),true);await pool.query('UPDATE shift_schema_version SET version=2');await assert.rejects(()=>store.checkReady(),/Unsupported/);await pool.query('UPDATE shift_schema_version SET version=1');});
  await t.test('room codec and receipt survive round trip; duplicate receipt rolls back',async()=>{
   await store.commitRoom({expectedVersion:null,room:room(),receipt:receipt('r')});assert.deepEqual(await store.getRoom('ROOMAAAA'),room());assert.deepEqual(await store.getReceipt('r'),receipt('r'));
   await assert.rejects(()=>store.commitRoom({expectedVersion:1,room:room('ROOMAAAA',2),receipt:receipt('r'),aiWrites:[ai('AIJOB#rollback')]}),{name:'ConflictError'});
   assert.equal((await store.getRoom('ROOMAAAA')).version,1);assert.equal(await store.getAi('AIJOB#rollback'),null);
  });
  await t.test('DurableGame create join ask retries survive independent PostgreSQL-backed instances',async()=>{
   let serial=0;const id=()=>`postgres-game-request-${++serial}`;
   const game=()=>new DurableGame({store:new PostgresStore({pool}),caseData:TRAIN_CASE,catalog:CASES});
   const first=game(),createId=id(),created=await first.create('session-A','A','demo',createId);
   const restarted=game(),replay=await restarted.create('session-A','A','demo',createId);assert.equal(replay.code,created.code);
   const joinId=id(),joined=await first.join(created.code,'session-B','B',joinId);
   assert.equal((await restarted.join(created.code,'session-B','B',joinId)).playerId,joined.playerId);
   await restarted.join(created.code,'session-C','C',id());
   await first.act(created.code,'session-A',{type:'start',id:id()});
   await first.act(created.code,'session-A',{type:'select',round:1,suspectId:'suspect-1',id:id()});
   const command={type:'ask',round:1,question:'Private PostgreSQL question',id:id()};
   const [a,b]=await Promise.all([first.act(created.code,'session-A',command),restarted.act(created.code,'session-A',command)]);
   assert.equal(a.version,b.version);
   const owner=await game().view(created.code,'session-A');assert.equal(owner.me.interviews[0].messages.length,1);
   assert.ok(!JSON.stringify(await game().view(created.code,'session-B')).includes(command.question));
   await assert.rejects(()=>restarted.act(created.code,'session-A',{...command,question:'Changed question'}),e=>e.status===409);
   assert.equal((await store.getRoom(created.code)).players.length,3);
   assert.equal((await pool.query("SELECT count(*)::integer n FROM shift_records WHERE kind='room'")).rows[0].n,1);
  });
  await t.test('pinned multi-case Portuguese job and preference receipts survive PostgreSQL restart',async()=>{
   const raw=translatedLibrary(),second={...structuredClone(TRAIN_CASE),id:'second-case',title:'Second synthetic case'};
   raw.cases.push(second);raw.catalog.push({id:second.id,title:second.title,available:true});
   const otherTranslation=translationFor(second);otherTranslation.title='Segundo caso sintético';raw.translations.push(otherTranslation);
   const data=validateCaseLibrary(raw),jobs=new AiJobs({store,policy}),first=new DurableGame({store,...data,ai:jobs});
   const id=()=>randomUUID(),command=(type,extra={})=>({id:id(),type,...extra});
   const a=await first.create('pg-pt','PT','demo',id(),'pt-BR');
   await first.join(a.code,'pg-en','EN',id(),'en-GB');await first.join(a.code,'pg-third','Third',id());
   const b=await first.create('pg-other','Other','second-case',id(),'pt-BR');
   await first.act(a.code,'pg-pt',command('start'));await first.act(a.code,'pg-pt',command('select',{round:1,suspectId:'suspect-0'}));
   const ask=command('ask',{round:1,question:'alibi'});await first.act(a.code,'pg-pt',ask);
   const job=(await pool.query("SELECT data FROM shift_records WHERE kind='ai' AND data->>'kind'='job'")).rows[0].data;
   assert.equal(job.locale,'pt-BR');assert.match(job.context.instructions,/Brazilian Portuguese/);
   const change=command('setLocale',{locale:'en-GB'});await first.act(a.code,'pg-pt',change);
   const revised=structuredClone(raw);revised.translations[0].deductions[0].text='Revised future clue only.';
   const restartStore=new PostgresStore({pool}),restartJobs=new AiJobs({store:restartStore,policy});
   const restarted=new DurableGame({store:restartStore,...validateCaseLibrary(revised),ai:restartJobs});
   await restarted.act(a.code,'pg-pt',ask); // exact question retry cannot duplicate admission
   await runJob({enabled:true,jobId:job.id,repository:restartJobs,provider:fakeProvider({reply:'Resposta portuguesa sintética preservada.',unlocked:['d-alibi-gap']})});
   const state=await restarted.view(a.code,'pg-pt');assert.equal(state.me.locale,'en-GB');
   assert.equal(state.me.interviews[0].messages.length,1);assert.equal(state.me.interviews[0].messages[0].reply,'Resposta portuguesa sintética preservada.');
   assert.equal(state.me.deductions[0].text,raw.translations[0].deductions[0].text);
   const later=command('setLocale',{locale:'pt-BR'});await restarted.act(a.code,'pg-pt',later);await restarted.act(a.code,'pg-pt',change);
   assert.equal((await restarted.view(a.code,'pg-pt')).me.locale,'pt-BR','old durable receipt cannot reapply stale English preference');
   assert.equal((await restarted.view(b.code,'pg-other')).case.title,'Segundo caso sintético');
   assert.equal((await restartStore.getRoom(a.code)).caseVersion,data.registry.current.get('demo').version);
   assert.equal((await restartStore.getRoom(b.code)).caseVersion,data.registry.current.get('second-case').version);
   assert.equal((await restarted.view(a.code,'pg-en')).me.interviews.length,0);
   await assert.rejects(()=>restarted.view(b.code,'pg-pt'));
   assert.equal((await pool.query("SELECT count(*)::integer n FROM shift_records WHERE kind='ai' AND data->>'kind'='job'")).rows[0].n,1);
   assert.equal((await pool.query('SELECT version FROM shift_schema_version')).rows[0].version,1);
  });
  await t.test('legacy and larger AI contexts round-trip in schema version one with conditional writes',async()=>{
   const legacy=ai('AIJOB#legacy',null,{kind:'job',status:'pending',context:{instructions:'Original instructions',input:'{"history":[],"question":"Old question?"}'}});
   const large=ai('AIJOB#large',null,{kind:'job',status:'pending',dueAt:123,context:{instructions:'i'.repeat(1000),input:JSON.stringify({history:Array.from({length:6},()=>({question:'"'.repeat(300),reply:'\\'.repeat(1200)})),question:'Continue?'})}});
   assert.ok(Buffer.byteLength(large.value.context.instructions+large.value.context.input)<=20000);
   const size=Buffer.byteLength(JSON.stringify(aiPut('synthetic-test',large).Put.Item));assert.ok(size>16000&&size<MAX_AI_ITEM_BYTES);
   await store.commitAi({writes:[legacy,large]});
   assert.deepEqual(await store.getAi(legacy.key),legacy.value);assert.deepEqual(await store.getAi(large.key),large.value);
   const completed={...large.value,version:2,status:'complete',dueAt:undefined};
   await store.commitAi({writes:[{key:large.key,expectedVersion:1,value:completed}]});
   assert.deepEqual(await store.getAi(large.key),JSON.parse(JSON.stringify(completed)));
   await assert.rejects(()=>store.commitAi({writes:[{key:large.key,expectedVersion:1,value:{...completed,status:'fallback'}}]}),{name:'ConflictError'});
   const oversized=ai('AIJOB#oversized',null,{padding:'x'.repeat(MAX_AI_ITEM_BYTES)});
   await assert.rejects(()=>store.commitAi({writes:[ai('AIJOB#must-not-appear'),oversized]}),/AI record too large/);
   assert.equal(await store.getAi('AIJOB#oversized'),null);assert.equal(await store.getAi('AIJOB#must-not-appear'),null);
   assert.deepEqual(await store.getAi(large.key),JSON.parse(JSON.stringify(completed)));
   assert.equal((await pool.query('SELECT version FROM shift_schema_version WHERE singleton=true')).rows[0].version,1);
  });
  await t.test('concurrent room updates have exactly one winner',async()=>{
   await store.commitRoom({expectedVersion:null,room:room(),receipt:receipt('init')});
   const results=await Promise.allSettled(Array.from({length:8},(_,i)=>store.commitRoom({expectedVersion:1,room:room('ROOMAAAA',2),receipt:receipt(`r${i}`)})));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.name,'ConflictError');
   assert.equal((await pool.query("SELECT count(*)::integer n FROM shift_records WHERE kind='receipt'")).rows[0].n,2);
  });
  await t.test('global AI budget reservation is atomic across distinct rooms',async()=>{
   await store.commitAi({writes:[ai('AIBUDGET#GLOBAL',null,{remaining:1})]});
   const results=await Promise.allSettled(['ROOMAAAA','ROOMBBBB'].map(code=>store.commitRoom({expectedVersion:null,room:room(code),receipt:receipt(code),aiWrites:[ai('AIBUDGET#GLOBAL',1,{remaining:0}),ai(`AIJOB#${code}`),ai(`AIOUTBOX#${code}`)]})));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.name,'ConflictError');
   assert.equal((await pool.query("SELECT count(*)::integer n FROM shift_records WHERE kind='room'")).rows[0].n,1);
   assert.equal((await pool.query("SELECT count(*)::integer n FROM shift_records WHERE kind='ai'")).rows[0].n,3);
   assert.equal((await store.getAi('AIBUDGET#GLOBAL')).remaining,0);
  });
  await t.test('failed AI room fence and checked budget leave every write unchanged',async()=>{
   await store.commitRoom({expectedVersion:null,room:room(),receipt:receipt('init')});await store.commitAi({writes:[ai('AIJOB#job'),ai('AIBUDGET#budget')]});
   await assert.rejects(()=>store.commitAi({roomCode:'ROOMAAAA',expectedRoomVersion:9,writes:[ai('AIJOB#job',1)]}),{name:'ConflictError'});
   await assert.rejects(()=>store.commitAi({roomCode:'ROOMAAAA',expectedRoomVersion:1,room:room('ROOMAAAA',2),checks:[{key:'AIBUDGET#budget',expectedVersion:9}],writes:[ai('AIJOB#job',1)]}),{name:'ConflictError'});
   assert.equal((await store.getRoom('ROOMAAAA')).version,1);assert.equal((await store.getAi('AIJOB#job')).version,1);
   await store.commitAi({roomCode:'ROOMAAAA',expectedRoomVersion:1,room:room('ROOMAAAA',2),checks:[{key:'AIBUDGET#budget',expectedVersion:1}],writes:[ai('AIJOB#job',1)]});assert.equal((await store.getRoom('ROOMAAAA')).version,2);
  });
  await t.test('concurrent rate limit consumption never exceeds maximum',async()=>{const results=await Promise.all(Array.from({length:30},()=>store.consumeCounter('minute',7,100)));assert.equal(results.filter(Boolean).length,7);});
  await t.test('session renewal cannot shorten expiry or resurrect revoked sessions',async()=>{
   await store.putSession('session',{expiresAt:100,user:'p'});assert.equal((await store.extendSession('session',10,500)).expiresAt,500);assert.equal((await store.extendSession('session',10,50)).expiresAt,500);
   await Promise.all([store.revokeSession('session'),store.extendSession('session',10,900)]);assert.equal(await store.getSession('session'),null);assert.equal(await store.extendSession('session',10,1000),null);
   await store.putSession('expired',{expiresAt:10});assert.equal(await store.extendSession('expired',10,500),null);
  });
  await t.test('due cursor resumes tied deadlines without duplicates and can be stored',async()=>{
   await store.commitAi({writes:['c','a','b'].map(k=>ai(`AIJOB#${k}`,null,{dueAt:20}))});await store.commitAi({writes:[ai('AIJOB#future',null,{dueAt:100}),ai('AIBUDGET#notdue')]});
   const first=await store.listAiDue(50,2);assert.deepEqual(first.keys,['AIJOB#a','AIJOB#b']);assert.ok(first.cursor);
   await store.commitAi({writes:[ai('AICURSOR#sweep',null,{cursor:first.cursor})]});
   const next=await store.listAiDue(50,2,(await store.getAi('AICURSOR#sweep')).cursor);assert.deepEqual(next.keys,['AIJOB#c']);assert.equal(next.cursor,null);
  });
  await t.test('TTL cleanup removes only expired rows in bounded batches',async()=>{
   await store.putSession('expired1',{expiresAt:10});await store.putSession('expired2',{expiresAt:10});await store.putSession('live',{expiresAt:200});await store.consumeCounter('expiredcounter',2,10);
   assert.equal(await store.cleanupExpired(10,2),2);assert.equal(await store.cleanupExpired(10,2),1);assert.equal(await store.cleanupExpired(10,2),0);assert.ok(await store.getSession('live'));
  });
 }finally{
  if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
 }
});
