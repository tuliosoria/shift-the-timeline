import test from 'node:test';
import assert from 'node:assert/strict';
import {collectConversationHistory,fitConversationHistory,MAX_HISTORY_EXCHANGES} from '../server/ai/conversation-history.mjs';
import {aiPut,MAX_AI_ITEM_BYTES} from '../server/storage/ai-codec.mjs';
import {buildChatContext} from '../server/ai/chat-context.mjs';
import {runJob} from '../server/ai/worker.mjs';
import {harness,id,fakeProvider,policy} from './helpers/ai.mjs';
import {AiJobs} from '../server/ai/jobs.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {caseData as publicDemo} from '../examples/public-demo.mjs';
import {TRAIN_CASE} from './fixtures/case.mjs';

const settled = (question, reply, status = 'complete') => ({question,reply,status});
const act = (h, type, data) => h.game.act(h.code,'session-A',{type,...data,id:id()});
const pending = h => h.jobList().filter(j=>j.status==='pending').at(-1);
const run = (h, job, reply = 'A resolved answer.', unlocked = []) => runJob({enabled:true,repository:h.jobs,jobId:job.id,provider:fakeProvider({reply,unlocked}),now:h.now});
const advance = async (h, round, suspectId = 'suspect-1') => {
  await act(h,'advance',{round,confirmed:true});
  await act(h,'select',{round:round+1,suspectId});
};

// Every production adapter validates this Item. Make the in-memory harness do so
// too, including later lease/start/settlement writes, rather than only checking
// an approximate context size at admission.
function validateStoredItems(h) {
  const measured = [];
  const validate = writes => {
    for (const write of writes ?? []) {
      const {Item} = aiPut('synthetic-test',write).Put;
      const size = Buffer.byteLength(JSON.stringify(Item));
      assert.ok(size<=MAX_AI_ITEM_BYTES);
      if (write.value.kind==='job') measured.push({status:write.value.status,size});
    }
  };
  const room = h.store.commitRoom.bind(h.store), ai = h.store.commitAi.bind(h.store);
  h.store.commitRoom = args => { validate(args.aiWrites); return room(args); };
  h.store.commitAi = args => { validate(args.writes); return ai(args); };
  return measured;
}

test('history is an ordered snapshot of only settled same-player/suspect exchanges',()=>{
  const first = settled('First private question','First private reply');
  const current = {question:'Now?',reply:null,status:'pending'};
  const visit = {round:3,suspectId:'same',messages:[settled('Third visit','Third reply','canonical'),current,settled('After admission','Never seen')]};
  const player = {id:'one',interviews:[visit,{round:1,suspectId:'same',messages:[first,{question:'Pending',reply:'Not resolved',status:'pending'},{question:'Failed',reply:'Not settled',status:'failed'},{question:'Blank reply',reply:null,status:'complete'}]},
    {round:2,suspectId:'other',messages:[settled('Other suspect','PRIVATE OTHER SUSPECT')]},
    {round:4,suspectId:'same',messages:[settled('Future question','Future answer')]}]};
  const other = {id:'two',interviews:[{round:1,suspectId:'same',messages:[settled('Other player','PRIVATE OTHER PLAYER')]}]};
  const room = {players:[player,other]};
  const history = collectConversationHistory({room,player,interview:visit,message:current});
  assert.deepEqual(history,[{round:1,question:'First private question',reply:'First private reply'},{round:3,question:'Third visit',reply:'Third reply'}]);
  first.reply = 'Changed later';
  assert.equal(history[0].reply,'First private reply','no live references survive admission');
  for (const wrong of [{room:{players:[other]}},{player:{...player}},{interview:{...visit}},{message:{...current}}]) {
    assert.throws(()=>collectConversationHistory({room,player,interview:visit,message:current,...wrong}),/admitted room and player/);
  }
});

test('history fitting keeps whole exchanges, recent context and the earliest anchor within count and bytes',()=>{
  const history = Array.from({length:11},(_,i)=>({round:1+Math.floor(i/3),question:`Q${i}`,reply:`R${i}`}));
  assert.deepEqual(fitConversationHistory(history,x=>x),history,'all normal exchanges retained when they fit');
  const fit = fitConversationHistory(history,x=>{if(x.length>4)throw new Error('full');return x;});
  assert.deepEqual(fit.map(x=>x.question),['Q0','Q8','Q9','Q10']);
  assert.equal(fit[0].reply,'R0');
  const oversized = history.map((x,i)=>i===0?{...x,reply:'x'.repeat(1000)}:x);
  const result = fitConversationHistory(oversized,x=>{if(Buffer.byteLength(JSON.stringify(x))>250)throw new Error('full');return x;});
  assert.ok(result.length>0);assert.ok(!result.some(x=>x.question==='Q0'),'oversized exchange is omitted, never cut mid-answer');
  assert.equal(result.at(-1).question,'Q10');
  const many = Array.from({length:30},(_,i)=>({round:1,question:`Q${i}`,reply:'R'}));
  const bounded = fitConversationHistory(many,x=>x);
  assert.equal(bounded.length,MAX_HISTORY_EXCHANGES);assert.equal(bounded[0].question,'Q0');assert.equal(bounded.at(-1).question,'Q29');
  assert.throws(()=>fitConversationHistory(history,()=>{throw new Error('base context too large');}),/base context too large/);
});

test('revisits remember only this player and suspect, with the current turn and own earned IDs',async()=>{
  const h = await harness();
  await h.ask('session-A',id(),'My first visit');await run(h,pending(h),'My first reply',['d-alibi-gap']);
  await h.ask('session-B',id(),'Someone else asks');await run(h,pending(h),'OTHER PLAYER PRIVATE REPLY',['d-alibi-gap']);
  await advance(h,1,'suspect-2');
  await h.ask('session-A',id(),'Different suspect question',2);await run(h,pending(h),'OTHER SUSPECT PRIVATE REPLY');
  await advance(h,2);
  await h.ask('session-A',id(),'I have returned',3);
  const job = pending(h), input = JSON.parse(job.context.input);
  assert.deepEqual(input.history,[{round:1,question:'My first visit',reply:'My first reply'}]);
  assert.equal(input.conversation.currentRound,3);
  assert.deepEqual(input.previouslyEarnedDeductionIds,['d-alibi-gap']);
  assert.ok(!job.context.input.includes('OTHER PLAYER')&&!job.context.input.includes('OTHER SUSPECT'));
  assert.deepEqual(job.context.allowedIds,['d-alibi-gap'],'allowed settlement scope is not reduced by earned IDs');
  assert.deepEqual(job.scope.deductions.map(d=>d.id),['d-alibi-gap']);
  assert.ok(job.context.input.includes('d-alibi-gap'),'the private earned context is included');
});

test('a late earlier-turn reply cannot rewrite a queued revisit or its idempotent replay',async()=>{
  const h = await harness();
  await h.ask('session-A',id(),'Resolved before leaving');await run(h,pending(h),'Earlier settled reply');
  await h.ask('session-A',id(),'Still unresolved when I leave');const earlier = pending(h);
  await advance(h,1);
  const request = id();await h.ask('session-A',request,'Back already?',2);const revisit = pending(h), snapshot = structuredClone(revisit.context);
  assert.deepEqual(JSON.parse(snapshot.input).history,[{round:1,question:'Resolved before leaving',reply:'Earlier settled reply'}]);
  await run(h,earlier,'Arrived after new admission');
  assert.deepEqual((await h.store.getAi(`AIJOB#${revisit.id}`)).context,snapshot);
  await h.ask('session-A',request,'Back already?',2);
  assert.equal(h.jobList().length,3);assert.deepEqual((await h.store.getAi(`AIJOB#${revisit.id}`)).context,snapshot);
  await run(h,revisit,'Reply to the revisit');
  await h.ask('session-A',id(),'And now?',2);
  assert.deepEqual(JSON.parse(pending(h).context.input).history,[
    {round:1,question:'Resolved before leaving',reply:'Earlier settled reply'},
    {round:1,question:'Still unresolved when I leave',reply:'Arrived after new admission'},
    {round:2,question:'Back already?',reply:'Reply to the revisit'},
  ],'the next admission sees the newly settled exchange, ordered by interview rather than completion time');
});

for (const mode of ['latin','multibyte','escaped']) test(`full-length ${mode} conversations stay within stored Item limits through every job phase`,async()=>{
  const h = await harness(), measured = validateStoredItems(h), originals = [];
  let lastAdmission;
  for (let round=1;round<=4;round++) {
    if(round>1)await advance(h,round-1);
    for (let n=0;n<3;n++) {
      const prefix = `${round}.${n}:`;
      const question = mode==='latin'?prefix+'q'.repeat(300-prefix.length):mode==='multibyte'?prefix+'界'.repeat(300-prefix.length):(prefix+'"\\'.repeat(150)).slice(0,300);
      const reply = mode==='latin'?prefix+'r'.repeat(1200-prefix.length):mode==='multibyte'?prefix+'界'.repeat(Math.floor((1200-prefix.length)/3))+'x'.repeat((1200-prefix.length)%3):(prefix+'"\\'.repeat(600)).slice(0,1200);
      assert.equal(question.length,300);assert.equal(Buffer.byteLength(reply),1200);
      const state = await h.ask('session-A',id(),question,round), job = pending(h);
      assert.equal(state.me.interviews.find(i=>i.round===round).messages.at(-1).status,'pending','history trimming admits AI instead of dropping the whole question');
      lastAdmission=structuredClone(job);
      const input = JSON.parse(job.context.input);
      assert.ok(Buffer.byteLength(job.context.instructions+job.context.input)<=20000,'provider context cap stays separate');
      assert.equal(input.question,question);assert.equal(input.suspect.brief,TRAIN_CASE.suspects[1].brief);
      assert.deepEqual(input.suspect.responses,TRAIN_CASE.suspects[1].responses);
      assert.ok(input.history.length<=MAX_HISTORY_EXCHANGES);
      for (const exchange of input.history)assert.ok(originals.some(x=>x.round===exchange.round&&x.question===exchange.question&&x.reply===exchange.reply),'exchanges are copied whole');
      if(originals.length&&input.history.length)assert.deepEqual(input.history.at(-1),originals.at(-1),'the most recent answer remains available');
      assert.equal((await run(h,job,reply)).status,'complete');
      originals.push({round,question,reply});
    }
  }
  assert.equal(h.jobList().length,12);
  const retained=JSON.parse(lastAdmission.context.input).history;
  assert.ok(retained.length<11,'fixture exercises the remaining provider byte limit');
  const previous=originals.slice(0,-1),current=originals.at(-1);
  const oldFit=fitConversationHistory(previous,history=>{
    const context={...buildChatContext({caseData:TRAIN_CASE,suspectId:'suspect-1',history,question:current.question,currentRound:4}),allowedIds:lastAdmission.context.allowedIds};
    const write={key:`AIJOB#${lastAdmission.id}`,expectedVersion:null,value:{...lastAdmission,context}};
    if(Buffer.byteLength(JSON.stringify(aiPut('synthetic-test',write).Put.Item))>16000-1024)throw Error('retired storage cap');
    return history;
  });
  assert.ok(retained.length>oldFit.length,'larger storage envelope retains more late-visit context than the retired 16,000-byte cap');
  assert.ok(measured.some(x=>x.size>16000),'fixture crosses the retired storage limit');
  for (const phase of ['pending','leased','provider_started','complete'])assert.ok(measured.some(x=>x.status===phase),phase);
  assert.ok(measured.filter(x=>x.status==='pending').every(x=>x.size<=MAX_AI_ITEM_BYTES-1024));
  const latest = h.jobList().at(-1);
  const grown = {...latest,version:Number.MAX_SAFE_INTEGER,leaseUntil:Number.MAX_SAFE_INTEGER,providerStartedAt:Number.MAX_SAFE_INTEGER,
    lastRecoveryFailureAt:Number.MAX_SAFE_INTEGER,finishedAt:Number.MAX_SAFE_INTEGER,settledMicroUsd:Number.MAX_SAFE_INTEGER,reason:'budget_unavailable',costUncertain:true};
  assert.doesNotThrow(()=>aiPut('synthetic-test',{key:`AIJOB#${grown.id}`,expectedVersion:Number.MAX_SAFE_INTEGER-1,value:grown}),'headroom covers lifecycle fields and version growth');
});

test('every public-demo suspect admits an ordinary question with and without an earlier exchange',async()=>{
  const now=Date.UTC(2026,10,12), code='ABCD2345';
  for(const suspect of publicDemo.suspects)for(const prior of [false,true]){
    const message={id:'m'.repeat(36),status:'pending',question:'What else can you tell me about that?',reply:null};
    const interview={suspectId:suspect.id,round:2,messages:[message]};
    const player={id:'p'.repeat(36),deductions:[],interviews:[]};
    if(prior)player.interviews.push({suspectId:suspect.id,round:1,messages:[settled('What did you notice?',suspect.responses.clue,'canonical')]});
    player.interviews.push(interview);
    const room={code,createdAt:now,caseVersion:publicDemo.version,players:[player]};
    const jobs=new AiJobs({store:new MemoryStore(),policy,now:()=>now});
    const writes=await jobs.prepareQuestion({room,player,interview,message,receiptKey:'r'.repeat(64),caseData:publicDemo});
    const job=writes.find(w=>w.value.kind==='job');
    assert.ok(job,`${suspect.id} admits with prior=${prior}`);
    const input=JSON.parse(job.value.context.input);
    assert.equal(input.history.length,prior?1:0,`${suspect.id} retains ordinary authored history`);
    assert.equal(input.question,message.question);
    assert.equal(input.suspect.brief,suspect.brief);
    assert.ok(Buffer.byteLength(JSON.stringify(aiPut('synthetic-test',job).Put.Item))<=MAX_AI_ITEM_BYTES-1024);
  }
});

test('ordinary four-turn visits retain all eleven settled exchanges',async()=>{
  const h=await harness(),history=[];
  for(let round=1;round<=4;round++){
    if(round>1)await advance(h,round-1);
    for(let question=0;question<3;question++){
      const text=`Question ${round}.${question}?`,reply=`Answer ${round}.${question}.`;
      await h.ask('session-A',id(),text,round);const job=pending(h);
      assert.deepEqual(JSON.parse(job.context.input).history,history);
      await run(h,job,reply);history.push({question:text,reply,round});
    }
  }
  assert.equal(JSON.parse(h.jobList().at(-1).context.input).history.length,11);
});

test('pre-upgrade pending job context without turn metadata still claims and settles',async()=>{
  const h=await harness();await h.ask('session-A',id(),'An older pending question');const job=pending(h);
  const input=JSON.parse(job.context.input);delete input.conversation;
  input.history=[{question:'An old exchange?',reply:'Its settled answer.'}];
  const context={...job.context,input:JSON.stringify(input)};
  h.store.ai.get(`AIJOB#${job.id}`).context=context;
  assert.ok(Buffer.byteLength(JSON.stringify(aiPut('synthetic-test',{key:`AIJOB#${job.id}`,expectedVersion:null,value:{...job,context}}).Put.Item))<16000);
  let captured;
  const provider=Object.assign(async value=>{captured=structuredClone(value);return {reply:'The older job still resolves.',unlocked:[],inputTokens:10,outputTokens:5};},{model:job.model});
  assert.equal((await runJob({enabled:true,repository:h.jobs,jobId:job.id,provider,now:h.now})).status,'complete');
  assert.deepEqual(captured,context);
  assert.deepEqual((await h.store.getAi(`AIJOB#${job.id}`)).context,context);
  const owner=await h.game.view(h.code,'session-A'),peer=await h.game.view(h.code,'session-B');
  assert.equal(owner.me.interviews[0].messages[0].reply,'The older job still resolves.');
  assert.ok(!JSON.stringify(peer).includes('The older job still resolves.'));
});
