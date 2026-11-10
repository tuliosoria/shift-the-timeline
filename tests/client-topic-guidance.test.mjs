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
