import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {inferTopic,questionTopic,topicLabels} from '../public/question-topics.js';
import {publicAsset,readPublicAsset} from '../server/public-assets.mjs';
import {GameService} from '../server/game.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';

const routes={
 alibi:['Where were you?','WHEN was that?','What time?','Yesterday','An alibi?','Onde estava?','Estávamos juntos','Qual horário?','Horários','ÁLIBI','Ontem','22','22h','22:30'],
 motive:['Why?','What motive?','Money','A secret?','Debt','What would you gain?','What could you lose?','Profit','Qual motivo?','Motivos','Dinheiro','Segredos','Dívidas','Ganharia algo?','Perdeu dinheiro?'],
 relationship:['The victim?','Who do you know?','Who knew?','Relationship','Related','A vítima?','Conhecia Elisa?','Qual relação?','Relações','Relacionamento'],
 clue:['What did you see?','Tell me more.','Evidence?','O que notou?','motives','sometime','somewhere','unknown','profitable','22hours','', '<script>alert(1)</script>'],
};
for(const [topic,questions] of Object.entries(routes))test(`shared classifier preserves ${topic} English and Portuguese keyword semantics`,()=>{
 for(const question of questions)assert.equal(inferTopic(question),topic,question);
});
test('collisions preserve alibi > motive > relationship > clue precedence',()=>{
 for(const question of ['Where is the money?','When did you know the victim?','Ontem descobriu o motivo?','Horário da relação?'])assert.equal(inferTopic(question),'alibi',question);
 for(const question of ['Why did you know the victim?','Dinheiro ou relação?','Segredo da vítima'])assert.equal(inferTopic(question),'motive',question);
 assert.equal(inferTopic('What evidence about the victim?'),'relationship');
});
test('the four exact trimmed shortcuts retain their explicit UI topics',()=>{
 assert.deepEqual({...topicLabels},{alibi:'Where were you at the time?',clue:'What did you notice?',motive:'What was at stake?',relationship:'How did you know the victim?'});
 for(const [topic,label] of Object.entries(topicLabels)){
  assert.equal(questionTopic(label),topic);assert.equal(questionTopic(` \n ${label} \t`),topic);
 }
 // This intentional distinction existed before extraction: the shortcut explicitly sends motive.
 assert.equal(inferTopic(topicLabels.motive),'clue');assert.equal(questionTopic(topicLabels.motive),'motive');
 assert.equal(questionTopic(topicLabels.motive.toLowerCase()),'clue');
 assert.equal(questionTopic('What was at stake? Also, where were you?'),'alibi');
 assert.ok(Object.isFrozen(topicLabels));
});
test('non-shortcut UI preview follows the server classifier exactly',()=>{
 for(const questions of Object.values(routes))for(const question of questions)assert.equal(questionTopic(question),inferTopic(question),question);
});
test('server automatic routing stays inference-only and explicit topics remain authoritative',()=>{
 const g=new GameService({caseData:TRAIN_CASE,catalog:CASES}),a=g.create('Host',TRAIN_CASE.id,randomUUID());
 g.join(a.code,'Second',randomUUID());g.join(a.code,'Third',randomUUID());
 const act=(type,data={})=>g.act(a.code,a.token,{id:randomUUID(),type,...data});
 act('start');act('select',{round:1,suspectId:TRAIN_CASE.suspects[0].id});
 let state=act('ask',{round:1,question:topicLabels.motive});assert.equal(state.me.interviews[0].messages.at(-1).topic,'clue');
 state=act('ask',{round:1,question:topicLabels.motive,topic:questionTopic(topicLabels.motive)});assert.equal(state.me.interviews[0].messages.at(-1).topic,'motive');
 state=act('ask',{round:1,question:'Where were you?',topic:'relationship'});assert.equal(state.me.interviews[0].messages.at(-1).topic,'relationship');
 assert.throws(()=>act('ask',{round:1,question:'Something?',topic:'hidden'}),/Invalid question topic/);
});
test('public manifest exposes only the single routing module, not server or case data',async()=>{
 assert.deepEqual(publicAsset('/question-topics.js'),{url:'/question-topics.js',file:'question-topics.js',type:'text/javascript; charset=utf-8'});
 for(const route of ['/server/game.mjs','/private/train-case.mjs','/src/case.mjs','/public/question-topics.js','/question-topics.js/../server/game.mjs'])assert.equal(publicAsset(route),undefined);
 const source=(await readPublicAsset('question-topics.js')).toString();
 assert.equal(source,await readFile(new URL('../public/question-topics.js',import.meta.url),'utf8'));
 assert.ok(!/^import\b/m.test(source),'The browser module has no imports or secret dependencies');
 for(const hidden of ['culpritId','responses','caseData','TRAIN_CASE'])assert.ok(!source.includes(hidden),hidden);
});
test('explicit and inferred duplicate topics reject without using a question or changing room activity',()=>{
 let time=1_000;const g=new GameService({caseData:TRAIN_CASE,catalog:CASES,now:()=>time}),a=g.create('Host',TRAIN_CASE.id,randomUUID());
 const peers=[a,g.join(a.code,'Second',randomUUID()),g.join(a.code,'Third',randomUUID())];
 const act=(type,data={})=>g.act(a.code,a.token,{id:randomUUID(),type,...data});
 act('start');act('select',{round:1,suspectId:TRAIN_CASE.suspects[0].id});
 const request={id:randomUUID(),type:'ask',round:1,question:'Where were you?'};
 const first=g.act(a.code,a.token,request),room=g.room(a.code),touched=room.touchedAt,seen=room.players[0].lastSeenAt,requests=room.players[0].requests.size;
 time+=30_000;
 for(const data of [{question:'When did that happen?'},{question:'Different wording',topic:'alibi'}])assert.throws(()=>act('ask',{round:1,...data}),e=>e.status===409&&/no question used/.test(e.message));
 assert.equal(g.view(a.code,a.token).version,first.version);assert.equal(room.touchedAt,touched);assert.equal(room.players[0].lastSeenAt,seen);assert.equal(room.players[0].requests.size,requests);
 assert.deepEqual(g.act(a.code,a.token,request),first,'same request remains a successful retry');
 assert.equal(g.view(a.code,a.token).me.interviews[0].messages.length,1);
 // Other players and later interviews still have their own topic allowance.
 const peer=peers[1];g.act(a.code,peer.token,{id:randomUUID(),type:'select',round:1,suspectId:TRAIN_CASE.suspects[0].id});
 const other=g.act(a.code,peer.token,{id:randomUUID(),type:'ask',round:1,question:'Where were you?'});assert.equal(other.me.interviews[0].messages[0].topic,'alibi');
 act('advance',{round:1,confirmed:true});act('select',{round:2,suspectId:TRAIN_CASE.suspects[0].id});
 const next=act('ask',{round:2,question:'Where were you?'});assert.equal(next.me.interviews[1].messages[0].topic,'alibi');
});
test('distinct-id concurrent duplicate questions commit once and reserve only one AI job/budget',async()=>{
 const {harness}=await import('./helpers/ai.mjs');const h=await harness();
 const commands=[randomUUID(),randomUUID()].map(id=>({id,type:'ask',round:1,question:'Tell me a clue.',topic:'clue',aiConsent:true}));
 const results=await Promise.allSettled(commands.map(action=>h.game.act(h.code,'session-A',action)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected');assert.equal(rejected.reason.status,409);assert.match(rejected.reason.message,/already covered/);
 const winner=commands[results.findIndex(r=>r.status==='fulfilled')];
 const state=await h.game.view(h.code,'session-A');assert.equal(state.me.interviews[0].messages.length,1);assert.equal(h.jobList().length,1);
 const job=h.jobList()[0];for(const key of job.budgetKeys)assert.equal((await h.store.getAi(key)).usedMicroUsd,job.reservedMicroUsd);
 const before=structuredClone([...h.store.ai]);
 const retry=await h.game.act(h.code,'session-A',winner);assert.equal(retry.version,state.version);assert.equal(h.jobList().length,1);
 await assert.rejects(()=>h.game.act(h.code,'session-A',{id:randomUUID(),type:'ask',round:1,question:'Another unrelated sentence'}),e=>e.status===409);
 assert.deepEqual([...h.store.ai],before);assert.equal((await h.game.view(h.code,'session-A')).version,state.version);
});
