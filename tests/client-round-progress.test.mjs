import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
function playing(){const state=clientState();state.me.interviews=[{round:1,suspectId:'ben',closed:false,opening:'Synthetic',messages:[{id:'m1',question:'Q1',answer:'Evidence 1',topic:'clue',narration:{status:'complete',text:'Unverified voice'}},{id:'m2',question:'Q2',answer:'Evidence 2',topic:'alibi'}]}];return state;}
function review(html){return html.match(/<section class="round-review">[\s\S]*?<\/section>/)?.[0]??'';}
test('round progress precedes optional composer and full board, without sending or sharing',()=>{
 const state=playing();state.board=Array.from({length:60},(_,i)=>({id:`n${i}`,type:'note',text:'Team note',by:'Agent Two',round:1}));
 const h=clientHarness(state);h.client.navigate('deduce');const html=h.element('main').innerHTML;
 assert.ok(html.indexOf('class="round-review"')<html.indexOf('id="correlation-form"'));
 assert.ok(html.indexOf('class="round-review"')<html.indexOf('Team board'));
 assert.match(review(html),/Answers still private<\/dt><dd>2<\/dd>/);
 assert.match(review(html),/Sharing answers and creating correlations are optional/);
 assert.match(review(html),/data-action="end"/);assert.equal(h.requests.length,0);assert.equal(h.client.read().state.board.length,60);
});
test('private count covers only current own canonical answers and existing clue IDs',()=>{
 const state=playing();state.me.interviews.unshift({round:0,suspectId:'ben',closed:true,messages:[{id:'old',answer:'Earlier private evidence'}]});
 state.board=[{id:'c',type:'clue',messageId:'m1',text:'Evidence 1',source:'Ben',by:'Agent One',round:1}];
 const h=clientHarness(state);h.client.navigate('deduce');const html=review(h.element('main').innerHTML);
 assert.match(html,/Answers still private<\/dt><dd>1<\/dd>/);assert.doesNotMatch(html,/Unverified voice|Earlier private evidence/);
});
test('no correlations or sharing required to open existing end confirmation; confirmation remains mandatory',async()=>{
 const h=clientHarness(playing());h.client.navigate('deduce');h.client.openConfirmation('end',{});assert.equal(h.requests.length,0);
 assert.match(h.element('confirm-body').innerHTML,/unused question/);
 await h.client.confirmAction();assert.equal(h.requests.length,1);assert.equal(h.requests[0].body.type,'end');assert.equal(h.requests[0].body.round,1);
});
test('closed interview shows authoritative waiting count without finish control and updates on new state',()=>{
 const state=playing();state.me.interviews[0].closed=true;state.players[0].ready=true;
 const h=clientHarness(state);h.client.navigate('deduce');assert.match(review(h.element('main').innerHTML),/Waiting for 2 agent/);assert.doesNotMatch(review(h.element('main').innerHTML),/data-action="end"/);
 state.players[1].ready=true;state.version++;h.client.applyState(state);assert.match(review(h.element('main').innerHTML),/Waiting for 1 agent/);
});
test('no interview points to suspect choice and accusation does not offer round completion',()=>{
 const h=clientHarness(clientState());h.client.navigate('deduce');assert.match(review(h.element('main').innerHTML),/Choose a suspect/);assert.doesNotMatch(review(h.element('main').innerHTML),/data-action="end"/);
 const state=playing();state.phase='accusation';const accused=clientHarness(state);accused.client.navigate('deduce');assert.equal(review(accused.element('main').innerHTML),'');assert.doesNotMatch(accused.element('main').innerHTML,/data-action="end"/);assert.match(accused.element('main').innerHTML,/Return to your accusation/);
});
