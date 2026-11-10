import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
function setup(){const state=clientState({phase:'accusation',round:3});state.suspects[0].profile='<img src=x onerror=evil()> PUBLIC_PROFILE';state.suspects[0].responses={clue:'SECRET_RESPONSE'};state.me.interviews=[{round:1,suspectId:'ben',messages:[{id:'private',answer:'PRIVATE_ANSWER',narration:{text:'PRIVATE_AI'}}]}];return {state,h:clientHarness(state)};}
test('accusation dossiers contain only escaped public profiles and remain outside radio labels',()=>{
 const {h}=setup();h.client.navigate('analyse');const html=h.element('main').innerHTML;
 assert.match(html,/&lt;img src=x onerror=evil\(\)&gt; PUBLIC_PROFILE/);assert.doesNotMatch(html,/<img src=x|SECRET_RESPONSE|PRIVATE_ANSWER|PRIVATE_AI/);
 assert.match(html,/<\/label><details id="vote-dossier-ben"/);assert.match(html,/aria-label="Read public dossier for Ben Hargreaves"/);
 assert.match(html,/Opening a dossier does not select or submit/);assert.equal(h.requests.length,0);assert.equal(h.client.read().state.me.vote,null);
});
test('dossier review preserves the existing separate accusation confirmation',async()=>{
 const {h}=setup();h.client.navigate('analyse');h.client.openConfirmation('vote',{suspectId:'ben'});assert.equal(h.requests.length,0);
 assert.match(h.element('confirm-title').textContent,/Accuse Ben Hargreaves/);h.client.closeConfirmation();assert.equal(h.requests.length,0);
 h.client.openConfirmation('vote',{suspectId:'ben'});await h.client.confirmAction();assert.equal(h.requests.length,1);assert.equal(h.requests[0].body.type,'vote');assert.equal(h.requests[0].body.suspectId,'ben');
});
test('sealed accusations do not offer a new choice or dossier form',()=>{
 const {state}=setup();state.me.vote='ben';const h=clientHarness(state);h.client.navigate('analyse');const html=h.element('main').innerHTML;
 assert.match(html,/Your accusation is sealed/);assert.doesNotMatch(html,/id="vote-form"|name="suspectId"|vote-dossier-/);
});
