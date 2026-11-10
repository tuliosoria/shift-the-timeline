import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {appSource} from './helpers/client-harness.mjs';
import {GameService} from '../server/game.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
const submit=appSource.slice(appSource.indexOf("document.addEventListener('submit'"),appSource.indexOf("document.addEventListener('input'"));
const labels=appSource.split('\n').find(s=>s.startsWith('const topicLabels='));
for(const [question,want]of [['Where were you at the time?','alibi'],['What did you notice?','clue'],['What was at stake?','motive'],['How did you know the victim?','relationship']])test(`canonical shortcut sends the ${want} topic rather than losing a limited question`,async()=>{
 const g=new GameService({caseData:TRAIN_CASE,catalog:CASES}),a=g.create('Host','demo',randomUUID());g.join(a.code,'Second',randomUUID());g.join(a.code,'Third',randomUUID());
 const act=(type,data={})=>g.act(a.code,a.token,{id:randomUUID(),type,...data});act('start');act('select',{round:1,suspectId:'suspect-1'});let handler;
 const sandbox={optionalAi:false,document:{addEventListener(_name,fn){handler=fn;}},busy:false,pending:null,state:{round:1},act:async(type,data)=>act(type,data),FormData:class{*[Symbol.iterator](){yield ['question',question];}},Object};
 vm.runInNewContext(labels+'\n'+submit,sandbox);await handler({preventDefault(){},target:{id:'question-form'}});
 const message=g.view(a.code,a.token).me.interviews[0].messages[0];assert.equal(message.topic,want);assert.equal(message.answer,TRAIN_CASE.suspects[1].responses[want]);
});
for(const [enabled,checked,want]of [[false,true,undefined],[true,false,undefined],[true,true,true]])test(`AI disclosure enabled=${enabled}, checked=${checked}: only explicit consent is sent`,async()=>{
 let handler,sent;
 const sandbox={optionalAi:enabled,document:{addEventListener(_name,fn){handler=fn;}},busy:false,pending:null,state:{round:1},act:async(_type,data)=>{sent=data;},FormData:class{*[Symbol.iterator](){yield ['question','What did you notice?'];if(checked)yield ['aiConsent','yes'];}},Object};
 vm.runInNewContext(labels+'\n'+submit,sandbox);await handler({preventDefault(){},target:{id:'question-form'}});assert.equal(sent.aiConsent,want);
});

test('public demo custom wording can explicitly obtain Ada observations; automatic matching is unchanged',async()=>{
 const {caseData,catalog}=await import('../examples/public-demo.mjs');
 const g=new GameService({caseData,catalog}),a=g.create('Host',caseData.id,randomUUID());g.join(a.code,'Second',randomUUID());g.join(a.code,'Third',randomUUID());
 const act=(type,data={})=>g.act(a.code,a.token,{id:randomUUID(),type,...data});act('start');act('select',{round:1,suspectId:'ada'});
 const question='Who had clearance at the time?';let handler,choice='';
 const sandbox={optionalAi:false,document:{addEventListener(_name,fn){handler=fn;}},busy:false,pending:null,state:{round:1},act:async(type,data)=>act(type,data),FormData:class{*[Symbol.iterator](){yield ['question',question];yield ['topic',choice];}},Object};
 vm.runInNewContext(labels+'\n'+submit,sandbox);await handler({preventDefault(){},target:{id:'question-form'}});
 assert.equal(g.view(a.code,a.token).me.interviews[0].messages[0].topic,'alibi');
 choice='clue';await handler({preventDefault(){},target:{id:'question-form'}});
 const messages=g.view(a.code,a.token).me.interviews[0].messages;assert.equal(messages[1].question,question);assert.equal(messages[1].answer,caseData.suspects.find(s=>s.id==='ada').responses.clue);
 await assert.rejects(()=>handler({preventDefault(){},target:{id:'question-form'}}),/already covered/);
 assert.equal(g.view(a.code,a.token).me.interviews[0].messages.length,2);
});
