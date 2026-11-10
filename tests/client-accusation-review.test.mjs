import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {appSource,clientHarness,clientState} from './helpers/client-harness.mjs';
function state(){const s=clientState({phase:'accusation',round:3,remainingHours:0});s.me.interviews=[{round:1,suspectId:'ben',opening:'Own opening one',closed:true,messages:[{id:'first',topic:'clue',question:'Own first question',answer:'Own first evidence'}]},{round:3,suspectId:'martha',opening:'Own opening three',closed:true,messages:[{id:'last',topic:'motive',question:'Own final question',answer:'Own final evidence'}]}];s.players[1].interviews=[{opening:'PEER_PRIVATE_SENTINEL',messages:[{answer:'PEER_PRIVATE_SENTINEL'}]}];return s;}
function event(h,name,target){let handler;h.sandbox.document.addEventListener=(_name,fn)=>{handler=fn;};const line=appSource.split('\n').find(line=>line.startsWith(`document.addEventListener('${name}'`));assert.ok(line);vm.runInNewContext(line,h.sandbox);handler({target});}
function currentTab(html){return [...html.matchAll(/<button data-stage="([^"]+)" aria-current="page"/g)].map(m=>m[1]);}
test('accusation offers three distinct review tabs and only own interview history',()=>{
 const h=clientHarness(state());h.client.navigate('interrogate');let html=h.element('main').innerHTML;
 assert.deepEqual(currentTab(html),['interrogate']);assert.match(html,/Review your interviews/);assert.match(html,/Own final evidence/);assert.match(html,/Own opening three/);assert.doesNotMatch(html,/PEER_PRIVATE_SENTINEL/);
 assert.match(html,/id="interview-round"/);assert.match(html,/Return to your accusation/);
 assert.doesNotMatch(html,/id="question-form"|id="question-topic"/);
 assert.match(html,/data-action="topic" data-id="clue" disabled/);
 assert.match(html,/data-action="review-topic" data-id="motive"/);
 event(h,'change',{id:'interview-round',value:'1'});html=h.element('main').innerHTML;
 assert.match(html,/Own first evidence/);assert.match(html,/Own opening one/);assert.doesNotMatch(html,/Own final evidence|PEER_PRIVATE_SENTINEL|id="question-form"/);
 h.client.applyState({...state(),version:4});assert.match(h.element('main').innerHTML,/Own first evidence/);
});
test('own historical evidence remains explicitly shareable in accusation',async()=>{
 const h=clientHarness(state());h.client.navigate('interrogate');event(h,'change',{id:'interview-round',value:'1'});
 assert.match(h.element('main').innerHTML,/data-action="share" data-id="first"/);
 h.client.openConfirmation('share',{messageId:'first'});assert.match(h.element('confirm-body').innerHTML,/Own first evidence/);assert.doesNotMatch(h.element('confirm-body').innerHTML,/Own first question/);
 await h.client.confirmAction();assert.equal(h.requests[0].body.type,'share');assert.equal(h.requests[0].body.messageId,'first');
});
test('unsubmitted vote selection survives review tab navigation',()=>{
 const h=clientHarness(state());h.client.navigate('analyse');event(h,'input',{id:'vote-martha',name:'suspectId',value:'martha',dataset:{}});
 h.client.navigate('interrogate');assert.deepEqual(currentTab(h.element('main').innerHTML),['interrogate']);
 h.client.navigate('deduce');assert.deepEqual(currentTab(h.element('main').innerHTML),['deduce']);
 h.client.navigate('analyse');const html=h.element('main').innerHTML;assert.deepEqual(currentTab(html),['analyse']);assert.match(html,/name="suspectId" value="martha" required checked/);
});
test('skipped final round defaults to latest available own interview without reopening questions',()=>{
 const s=state();s.me.interviews[1].round=2;s.me.interviews[1].closed=false;const h=clientHarness(s);h.client.navigate('interrogate');let html=h.element('main').innerHTML;
 assert.match(html,/Own final evidence/);assert.match(html,/<option value="2" selected>/);assert.match(html,/Questioning has ended/);assert.doesNotMatch(html,/Choose a suspect|id="question-form"/);
 event(h,'change',{id:'interview-round',value:'1'});h.client.applyState({...s,version:5});html=h.element('main').innerHTML;assert.match(html,/Own first evidence/);assert.doesNotMatch(html,/Own final evidence/);
});
test('no-interview accusation review is honest and offers no suspect selection',()=>{
 const s=state();s.me.interviews=[];const h=clientHarness(s);h.client.navigate('interrogate');const html=h.element('main').innerHTML;
 assert.match(html,/No interviews to review/);assert.match(html,/Return to your accusation/);assert.doesNotMatch(html,/Choose a suspect|id="question-form"|data-action="select"|PEER_PRIVATE_SENTINEL/);
});
test('all three own rounds remain available during accusation without investigation instructions',()=>{
 const s=state();s.me.interviews.splice(1,0,{round:2,suspectId:'ben',opening:'Own opening two',closed:true,messages:[{id:'middle',topic:'alibi',question:'Own middle question',answer:'Own middle evidence'}]});
 const h=clientHarness(s);h.client.navigate('interrogate');
 for(const [value,text]of [['1','Own first evidence'],['2','Own middle evidence'],['current','Own final evidence']]){
  event(h,'change',{id:'interview-round',value});const html=h.element('main').innerHTML;
  assert.match(html,new RegExp(text));assert.deepEqual(currentTab(html),['interrogate']);
  assert.doesNotMatch(html,/Who will you question|Choose a suspect|Moving to Deduce does not end|Review your findings before finishing the round|id="question-form"/);
 }
});
