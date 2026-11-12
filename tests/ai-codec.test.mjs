import test from 'node:test';
import assert from 'node:assert/strict';
import {aiPut,MAX_AI_ITEM_BYTES} from '../server/storage/ai-codec.mjs';
import {PostgresStore} from '../server/storage/postgres.mjs';

const write = (padding = '') => ({key:'AIJOB#synthetic',expectedVersion:null,value:{kind:'job',version:1,status:'pending',expiresAt:1_800_000_000_000,dueAt:1_799_999_999_000,context:{instructions:'Synthetic instructions',input:'{"question":"Private synthetic question","history":[]}'},padding}});
const bytes = value => Buffer.byteLength(JSON.stringify(value));

test('AI storage accepts records above the retired 16,000-byte limit without changing their shape',()=>{
  const command=write('x'.repeat(20000)),{Item}=aiPut('synthetic-table',command).Put;
  assert.ok(bytes(Item)>16000&&bytes(Item)<MAX_AI_ITEM_BYTES);
  assert.deepEqual(Item.data,command.value);
  assert.deepEqual(Object.keys(Item).sort(),['aiDuePk','aiDueSk','data','pk','sk','ttl','version']);
  assert.equal(Item.aiDueSk,`${String(command.value.dueAt).padStart(16,'0')}#${command.key}`);
});

test('the complete UTF-8 Item is accepted at 64 KiB and rejected one byte above it',()=>{
  const command=write(),base=bytes(aiPut('synthetic-table',command).Put.Item);
  command.value.padding='x'.repeat(MAX_AI_ITEM_BYTES-base);
  assert.equal(bytes(aiPut('synthetic-table',command).Put.Item),64*1024);
  command.value.padding+='x';
  assert.throws(()=>aiPut('synthetic-table',command),/AI record too large/);
  for(const padding of ['\u754c'.repeat(22000),'\u0000'.repeat(11000)]){
    assert.ok(padding.length<MAX_AI_ITEM_BYTES,'a character-count guard would miss this');
    assert.throws(()=>aiPut('synthetic-table',write(padding)),/AI record too large/);
  }
});

test('near-20,000-byte escaped provider context fits storage including lifecycle fields',()=>{
  const command=write();
  command.value.context={instructions:'i'.repeat(1000),input:JSON.stringify({history:Array.from({length:6},(_,i)=>({round:Math.floor(i/3)+1,question:'"'.repeat(300),reply:'\\'.repeat(1200)})),question:'Continue?'})};
  const contextBytes=Buffer.byteLength(command.value.context.instructions+command.value.context.input);
  assert.ok(contextBytes>19000&&contextBytes<=20000);
  let {Item}=aiPut('synthetic-table',command).Put;
  assert.ok(bytes(Item)>32000&&bytes(Item)<MAX_AI_ITEM_BYTES-1024,'nested escaping is safely stored beyond the old limit');
  const value={...command.value,version:4,status:'complete',fence:'f'.repeat(36),leaseUntil:1_800_000_000_001,providerStartedAt:1_800_000_000_002,finishedAt:1_800_000_000_003,lastRecoveryFailureAt:1_800_000_000_000,settledMicroUsd:1234,costUncertain:false,reason:null,dueAt:undefined};
  Item=aiPut('synthetic-table',{...command,expectedVersion:3,value}).Put.Item;
  assert.ok(bytes(Item)<MAX_AI_ITEM_BYTES);assert.equal(Item.aiDuePk,undefined);
});

test('pre-upgrade AI records remain readable and use the same conditional update contract',async()=>{
  const legacy={kind:'job',version:1,status:'pending',expiresAt:1800000000000,dueAt:1799999999000,context:{instructions:'Original',input:'{"history":[{"question":"First?","reply":"Earlier reply"}],"question":"Next?"}'}};
  const legacyItem={pk:'AIJOB#legacy',sk:'AI',version:1,ttl:1800000000,data:legacy,aiDuePk:'AI#DUE',aiDueSk:'0001799999999000#AIJOB#legacy'};
  assert.deepEqual(aiPut('synthetic-table',{key:legacyItem.pk,expectedVersion:null,value:legacy}).Put.Item,legacyItem);
  const calls=[];
  const client={query:async(text,values)=>{calls.push({text,values});return {rows:text.startsWith('SELECT data')?[{data:legacy}]:[],rowCount:1};},release(){}};
  const store=new PostgresStore({pool:{connect:async()=>client,query:client.query}});
  const restored=await store.getAi(legacyItem.pk);assert.deepEqual(restored,legacy);
  const updated={...restored,version:2,status:'leased',fence:'f'.repeat(36)};
  await store.commitAi({writes:[{key:legacyItem.pk,expectedVersion:1,value:updated}]});
  const update=calls.find(c=>c.text.startsWith('UPDATE'));
  assert.deepEqual(JSON.parse(update.values[3]),updated);assert.equal(update.values[6],1);
  assert.deepEqual(JSON.parse(updated.context.input).history,[{question:'First?',reply:'Earlier reply'}]);
});
