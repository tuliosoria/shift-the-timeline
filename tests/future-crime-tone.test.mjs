import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChatContext} from '../server/ai/chat-context.mjs';
import {caseData} from '../examples/public-demo.mjs';
import {interviewOpening,casePrediction} from '../public/case-presentation.js';
import {topicLabels,questionTopic} from '../public/question-topics.js';
import {renderBriefing} from '../public/views.js';
test('interview context establishes investigator identity without inventing a personal name',()=>{
 const {instructions}=buildChatContext({caseData,suspectId:'ada',question:'Do you know who I am?'});
 assert.match(instructions,/You know the interviewer is an investigator from the Future Crime Police/);
 assert.match(instructions,/victim is still alive/);
 assert.match(instructions,/do not invent their personal name/);
 assert.doesNotMatch(instructions,/No stage directions, stock greetings or offers to help/);
});
test('every public suspect greets the investigator rather than delivering an evidence maxim',()=>{
 for(const s of caseData.suspects) assert.match(interviewOpening(caseData,s),/investigator|Future Crime Police/i,s.name);
});
test('suggested questions avoid treating the forecast as a completed death',()=>{
 assert.equal(topicLabels.relationship,'Do you know the person at risk?');
 assert.equal(topicLabels.motive,'Have you had any disagreements recently?');
 for(const [topic,label] of Object.entries(topicLabels)) assert.equal(questionTopic(label.toLowerCase()),topic);
});
test('briefing explains cooperation, future danger and automatic turn advance in plain English',()=>{
 const html=renderBriefing({case:caseData,clock:{crimeAt:'18:00'},config:{rounds:4,maxQuestions:3,hoursPerRound:6}},{});
 for(const phrase of ['Future Crime Police','still alive','everyone finishes','different suspects']) assert.ok(html.includes(phrase),phrase);
});
test('suggestions name the living person at risk without exposing private case facts',async()=>{
 const {renderChatFooter}=await import('../public/views.js');
 const s=caseData.suspects[0];
 const html=renderChatFooter({case:caseData,phase:'investigation',round:1,suspects:caseData.suspects,me:{interviews:[{round:1,suspectId:s.id,closed:false,messages:[]}]}},{selected:s.id,draft:''});
 assert.ok(html.includes('Do you know Dr Iona Vale?'));
 assert.ok(html.includes('Have you had any disagreements with Dr Iona Vale recently?'));
});

test('presentation changes preserve the canonical case hash used by active rooms',async()=>{
 const {validateCase}=await import('../server/case-loader.mjs');
 const {catalog}=await import('../examples/public-demo.mjs');
 const before=JSON.stringify(caseData),version=validateCase({caseData,catalog}).caseData.version;
 assert.match(casePrediction(caseData),/alive now/);
 for(const s of caseData.suspects)interviewOpening(caseData,s);
 assert.equal(JSON.stringify(caseData),before);
 assert.equal(validateCase({caseData,catalog}).caseData.version,version);
});
test('new interview greetings do not overwrite stored previous interviews',async()=>{
 const {GameService}=await import('../server/game.mjs');
 const {catalog}=await import('../examples/public-demo.mjs');
 const {randomUUID}=await import('node:crypto');
 const g=new GameService({caseData,catalog});const h=g.create('Host',caseData.id,randomUUID());
 const a=g.join(h.code,'Two',randomUUID()),b=g.join(h.code,'Three',randomUUID());
 g.act(h.code,h.token,{id:randomUUID(),type:'start'});
 g.act(h.code,h.token,{id:randomUUID(),type:'select',round:1,suspectId:'ada'});
 const room=g.rooms.get(h.code),p=room.players.find(p=>p.token===h.token);
 assert.match(p.interviews[0].opening,/Future Crime Police/);
 p.interviews[0].opening='Previously recorded greeting';
 assert.equal(g.view(h.code,h.token).me.interviews[0].opening,'Previously recorded greeting');
});
