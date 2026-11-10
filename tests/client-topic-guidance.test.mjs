import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
function playing(){const state=clientState();state.me.interviews=[{round:1,suspectId:'ben',opening:'Synthetic',closed:false,messages:[{id:'own-motive',topic:'motive',question:'Why?',answer:'Canonical motive'}]}];return state;}
test('heard topic offers review while unanswered topics remain available without exposing teammates',()=>{
 const h=clientHarness(playing());h.client.navigate('interrogate');const html=h.element('main').innerHTML;
 assert.match(html,/data-action="review-topic" data-id="motive"[^>]*>What was at stake\? · Review answer/);
 assert.match(html,/data-action="topic" data-id="alibi"/);assert.match(html,/id="answer-own-motive" tabindex="-1"/);
 assert.equal(h.requests.length,0);assert.match(h.client.topicHint('Why?'),/Already covered/);assert.match(h.client.topicHint('Where were you?'),/One question/);
});
test('review answer focuses only the own transcript without a network request or draft loss',()=>{
 const h=clientHarness(playing());h.client.navigate('interrogate');h.client.reviewTopic('motive');assert.equal(h.element('answer-own-motive').focused,true);assert.equal(h.requests.length,0);
 h.client.reviewTopic('alibi');assert.equal(h.requests.length,0);
});
test('closed interview keeps review controls but cannot open unused topic composers',()=>{
 const s=playing();s.me.interviews[0].closed=true;const h=clientHarness(s);h.client.navigate('interrogate');const html=h.element('main').innerHTML;
 assert.match(html,/data-action="review-topic" data-id="motive"/);assert.match(html,/data-action="topic" data-id="alibi" disabled/);assert.doesNotMatch(html,/id="question-form"/);
});
test('explicit topic changes preview and repeat warning without changing the question',()=>{
 const h=clientHarness(playing()),context={room:'ABCDEFGH',player:'p1',round:1,phase:'investigation',suspect:'ben'};
 const question='Who had clearance at the time?';h.client.ui.writeDraft(context,'question',question);
 assert.match(h.client.topicHint(question),/Alibi · One question/);
 h.client.ui.writeDraft(context,'questionTopic','motive');assert.match(h.client.topicHint(question),/Motive · Already covered/);
 h.client.ui.writeDraft(context,'questionTopic','clue');assert.match(h.client.topicHint(question),/Observations · One question/);
 h.client.navigate('interrogate');assert.match(h.element('main').innerHTML,/id="question-topic" name="topic"/);assert.match(h.element('main').innerHTML,/<option value="clue" selected>/);
 assert.equal(h.client.ui.read(context).question,question);
});
test('topic choice survives rejection and safe retry, resets only matching successful draft',async()=>{
 const h=clientHarness(playing()),context={room:'ABCDEFGH',player:'p1',round:1,phase:'investigation',suspect:'ben'};
 h.client.ui.writeDraft(context,'questionTopic','clue');h.client.ui.writeDraft(context,'question','Question');
 h.sandbox.fetch=async()=>({ok:false,status:409,json:async()=>({error:'Rejected'})});
 await h.client.command('/api/rooms/ABCDEFGH/actions',{type:'ask',id:'test-id',question:'Question',topic:'clue',round:1});
 assert.equal(h.client.ui.read(context).questionTopic,'clue');assert.equal(h.client.read().pending,null);
 h.sandbox.fetch=async()=>{throw Error('Disconnected');};
 await h.client.command('/api/rooms/ABCDEFGH/actions',{type:'ask',id:'retry-id',question:'Question',topic:'clue',round:1});
 assert.equal(h.client.read().pending.body.topic,'clue');assert.equal(h.client.ui.read(context).questionTopic,'clue');
 h.client.ui.writeDraft(context,'questionTopic','relationship');
 let sent;h.sandbox.fetch=async(_path,options)=>{sent=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({...playing(),version:3})};};
 await h.client.runPending();assert.equal(sent.topic,'clue');assert.equal(h.client.ui.read(context).questionTopic,'relationship');assert.equal(h.client.ui.read(context).question,'Question');
 h.client.ui.writeDraft(context,'question','New question');
 await h.client.command('/api/rooms/ABCDEFGH/actions',{type:'ask',id:'success-id',question:'New question',topic:'relationship',round:1});
 assert.equal(h.client.ui.read(context).questionTopic,'');
 h.client.ui.writeDraft(context,'questionTopic','clue');const next=playing();next.round=2;next.version=4;next.me.interviews.push({round:2,suspectId:'martha',messages:[]});h.client.applyState(next);
 assert.match(h.client.topicHint('Where?'),/Alibi/);
});

for(const edit of [{question:'Newer wording',questionTopic:'clue'},{question:'Original wording',questionTopic:'motive'}])test(`delayed success preserves the whole question/topic pair after edit to ${edit.question}/${edit.questionTopic}`,async()=>{
 const h=clientHarness(playing()),context={room:'ABCDEFGH',player:'p1',round:1,phase:'investigation',suspect:'ben'};
 h.client.ui.writeDraft(context,'question','Original wording');h.client.ui.writeDraft(context,'questionTopic','clue');
 let release;const gate=new Promise(resolve=>{release=resolve;});
 h.sandbox.fetch=async()=>{await gate;return {ok:true,status:200,json:async()=>({...playing(),version:3})};};
 const pending=h.client.command('/api/rooms/ABCDEFGH/actions',{type:'ask',id:'delayed-id',question:'Original wording',topic:'clue',round:1});
 h.client.ui.writeDraft(context,'question',edit.question);h.client.ui.writeDraft(context,'questionTopic',edit.questionTopic);
 release();await pending;
 assert.equal(h.client.ui.read(context).question,edit.question);assert.equal(h.client.ui.read(context).questionTopic,edit.questionTopic);
});
