import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
function render(state){const h=clientHarness(state);return {h,html:vm.runInNewContext('investigationDebrief()',h.sandbox)};}
test('debrief is read-only, escapes records and includes only own canonical interviews',()=>{
 const state=clientState({phase:'reveal'});
 state.me.interviews=[{round:1,suspectId:'ben',opening:'Own opening',messages:[{topic:'clue',answer:'Own <evidence>',question:'Private wording omitted',narration:{status:'complete',text:'AI invented secret'}}]}];
 state.players[1].interviews=[{opening:'Another player private opening',messages:[{answer:'Other private answer'}]}];
 state.suspects[0].hidden='Unseen secret answer';
 state.board=[{id:'n1',type:'note',text:'Shared <note>',by:'Agent <One>',round:1},{id:'c1',type:'correlation',sources:[{kind:'suspect',id:'ben'},{kind:'case',id:'place'}],relation:'supports',text:'Team theory',by:'Agent Two',round:2}];
 const {h,html}=render(state);assert.match(html,/Own opening/);assert.match(html,/Own &lt;evidence&gt;/);assert.match(html,/Shared &lt;note&gt;/);assert.match(html,/Team hypothesis/);assert.match(html,/Unverified/);assert.match(html,/Round 1 · Ben Hargreaves/);
 for(const hidden of ['AI invented secret','Another player private opening','Other private answer','Unseen secret answer','Private wording omitted'])assert.equal(html.includes(hidden),false);
 assert.doesNotMatch(html,/<form|<button|data-action|data-submit/);assert.equal(h.requests.length,0);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
});
test('empty debrief distinguishes absent interviews and absent shared records',()=>{const {html}=render(clientState({phase:'reveal'}));assert.match(html,/You did not record any interviews/);assert.match(html,/No records were shared/);assert.doesNotMatch(html,/Share an interview answer/);});
test('interviews with no questions remain reviewable and grouped by round',()=>{const state=clientState({phase:'reveal'});state.me.interviews=[{round:1,suspectId:'ben',opening:'First opening',messages:[]},{round:3,suspectId:'martha',opening:'Last opening',messages:[]}];const {html}=render(state);assert.match(html,/debrief-interview-1/);assert.match(html,/debrief-interview-3/);assert.equal((html.match(/No questions were asked/g)||[]).length,2);});
