import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
import {uiContext} from '../public/ui-state.js';
function setup(){const s=clientState();s.board=[{id:'clue1',type:'clue',source:'Ben',text:'<img src=x onerror=evil()> '+ 'Full public evidence '.repeat(12),by:'Agent Two',round:1}];s.me.interviews=[{round:1,suspectId:'ben',opening:'PRIVATE_OPENING',messages:[{id:'private',answer:'PRIVATE_ANSWER',question:'PRIVATE_QUESTION',narration:{text:'PRIVATE_AI'}}]}];return {s,h:clientHarness(s)};}
test('selected previews show full escaped public evidence, never private answers or AI',()=>{const {s,h}=setup();h.client.ui.writeDraft(uiContext(s),'correlation',{sources:[{kind:'clue',id:'clue1'},{kind:'case',id:'place'}],relation:'supports',text:'Draft hypothesis'});h.client.navigate('deduce');const html=h.element('main').innerHTML;const preview=html.slice(html.indexOf('id="source-preview-a"'),html.indexOf('<label for="relation">'));assert.ok(preview.includes('Full public evidence '.repeat(12)));assert.ok(preview.includes('&lt;img'));assert.ok(!preview.includes('<img'));assert.ok(!/PRIVATE_/.test(preview));assert.match(preview,/Shared case evidence/);assert.match(preview,/Public case fact/);});
test('inline updates preserve composer draft and focus without rendering main',()=>{const {s,h}=setup();h.client.navigate('deduce');const before=h.element('main').innerHTML;const select=h.element('source-a');h.sandbox.document.activeElement=select;const draft={sources:[{kind:'clue',id:'clue1'},null],relation:'contradicts',text:'Keep this draft'};h.client.ui.writeDraft(uiContext(s),'correlation',draft);vm.runInNewContext('updateSourcePreviews()',h.sandbox);assert.equal(h.element('main').innerHTML,before);assert.equal(h.sandbox.document.activeElement,select);assert.deepEqual(h.client.ui.read(uiContext(s)).correlation,draft);assert.match(h.element('source-preview-a').innerHTML,/Full public evidence/);assert.match(h.element('source-preview-b').innerHTML,/Choose a public source/);});
test('missing public source is explained without substituting private material',()=>{const {s,h}=setup();h.client.ui.writeDraft(uiContext(s),'correlation',{sources:[{kind:'clue',id:'private'}],relation:'related',text:''});vm.runInNewContext('updateSourcePreviews()',h.sandbox);assert.match(h.element('source-preview-a').innerHTML,/source is unavailable/);assert.doesNotMatch(h.element('source-preview-a').innerHTML,/PRIVATE_/);});
test('public dossier source retains role and full profile, escaped in previews and board expansions',()=>{
 const s=clientState();s.suspects[0].profile='<script>not markup</script> '+ 'Public profile detail '.repeat(20);
 s.suspects[0].responses={clue:'PRIVATE_RESPONSE'};
 s.me.interviews=[{round:1,suspectId:'ben',messages:[{id:'secret',answer:'PRIVATE_ANSWER',question:'PRIVATE_QUESTION',narration:{text:'PRIVATE_AI'}}]}];
 s.board=[{id:'link',type:'correlation',sources:[{kind:'suspect',id:'ben'},{kind:'case',id:'place'}],relation:'related',text:'A public hypothesis',by:'Agent One',round:1}];
 const h=clientHarness(s),source=h.client.publicSources().find(source=>source.kind==='suspect'&&source.id==='ben');
 assert.equal(source.text,s.suspects[0].role+'\n\n'+s.suspects[0].profile);
 for(const expression of ["sourcePreview({kind:'suspect',id:'ben'},'Source A')",'boardRecords(state.board)']){
  const html=vm.runInNewContext(expression,h.sandbox);assert.ok(html.includes('Public profile detail '.repeat(20)));assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|PRIVATE_/);
 }
 assert.equal(h.requests.length,0);
});
test('source search finds profile-only words and keeps chosen sources visible',()=>{
 const s=clientState();s.suspects[0].profile='Maintains the unique chronometer.';const h=clientHarness(s);
 const options=vm.runInNewContext("sourceSearch='CHRONOMETER';sourceOptions('suspect:martha')",h.sandbox);
 assert.match(options,/value="suspect:ben"/);assert.match(options,/value="suspect:martha" selected/);assert.doesNotMatch(options,/value="case:place"/);
});
test('legacy public dossier without a profile still has its role, never undefined',()=>{
 const s=clientState();delete s.suspects[0].profile;const h=clientHarness(s);
 assert.equal(h.client.publicSources().find(source=>source.kind==='suspect'&&source.id==='ben').text,s.suspects[0].role);
});
