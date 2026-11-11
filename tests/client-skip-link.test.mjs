import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {appSource,clientHarness,clientState} from './helpers/client-harness.mjs';
import {uiContext} from '../public/ui-state.js';
function activateSkip(h){let prevented=false,scrolled=false;h.element('main').scrollIntoView=()=>{scrolled=true;};h.sandbox.skipEvent={target:{closest:selector=>selector==='a.skip[href="#main"]'?{}:null},preventDefault(){prevented=true;}};assert.equal(vm.runInNewContext('skipToInvestigation(skipEvent)',h.sandbox),true);return {prevented,scrolled};}
for(const stage of ['interrogate','deduce'])test(`keyboard skip preserves ${stage}, its drafts, URL history and rendered content`,()=>{
 const state=clientState(),h=clientHarness(state);h.client.ui.writeDraft(uiContext(state),'note','Unsent team note');h.client.navigate(stage);
 const html=h.element('main').innerHTML,historyCount=h.historyCalls.length;
 assert.deepEqual(activateSkip(h),{prevented:true,scrolled:true});assert.equal(h.element('main').focused,true);
 assert.equal(h.client.read().stage,stage);assert.equal(h.client.ui.read(uiContext(state)).stage,stage);
 assert.equal(h.element('main').innerHTML,html);assert.equal(h.client.ui.read(uiContext(state)).note,'Unsent team note');
 assert.equal(h.historyCalls.length,historyCount);assert.equal(h.requests.length,0);
});
test('skip is handled before the button-only click path without intercepting unrelated links',()=>{
 const h=clientHarness(clientState());h.sandbox.skipEvent={target:{closest:()=>null},preventDefault(){assert.fail('Unrelated click was cancelled');}};
 assert.equal(vm.runInNewContext('skipToInvestigation(skipEvent)',h.sandbox),false);
 assert.match(appSource,/document.addEventListener\('click',async event=>\{\s*if\(skipToInvestigation\(event\)\)return;/);
});
test('skip preserves accusation review and the selected ballot without submitting',()=>{
 const h=clientHarness(clientState({phase:'accusation'}));vm.runInNewContext("selectedVote='ben'",h.sandbox);h.client.navigate('deduce');activateSkip(h);
 assert.equal(h.client.read().stage,'deduce');assert.equal(vm.runInNewContext('selectedVote',h.sandbox),'ben');assert.equal(h.requests.length,0);
});
