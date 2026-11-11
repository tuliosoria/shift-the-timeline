import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
import {uiContext} from '../public/ui-state.js';
function setup(phase='investigation'){
 const s=clientState({phase});s.board=[{id:'e1',type:'clue',source:'Ben',text:'Shared exact evidence one',by:'Agent Two',round:1},{id:'e2',type:'clue',source:'Ben',text:'Shared exact evidence two',by:'Agent Two',round:1},{id:'n1',type:'note',text:'Not evidence',by:'Agent Two',round:1}];
 s.me.interviews=[{round:1,suspectId:'ben',messages:[{id:'private',answer:'PRIVATE_ONLY',question:'QUESTION_ONLY',narration:{text:'AI_ONLY'}}]}];
 const h=clientHarness(s),context=uiContext(s);return {s,h,context};
}
function pick(h,id,slot){h.sandbox.pickId=id;h.sandbox.pickSlot=slot;return vm.runInNewContext('useSharedEvidence(pickId,pickSlot)',h.sandbox);}
const read=({h,context})=>h.client.ui.read(context).correlation;
test('picking exact shared evidence updates only one local source and preserves hypothesis, relation and filters',()=>{
 const x=setup(),{h,context,s}=x;const draft={sources:[{kind:'case',id:'place'},{kind:'suspect',id:'ben'}],relation:'contradicts',text:'Keep my theory'};
 h.client.ui.writeDraft(context,'correlation',draft);h.client.ui.writeDraft(context,'question','Private question draft');h.client.ui.writeDraft(context,'note','Unsent team note');h.client.navigate('deduce');
 vm.runInNewContext("boardSearch='exact';boardFilter='clue';sourceSearch='missing'",h.sandbox);
 assert.equal(pick(h,'e1','a'),true);assert.deepEqual(read(x),{...draft,sources:[{kind:'clue',id:'e1'},draft.sources[1]]});
 assert.equal(h.client.ui.read(context).question,'Private question draft');assert.equal(h.client.ui.read(context).note,'Unsent team note');
 assert.equal(vm.runInNewContext('boardSearch+":"+boardFilter+":"+sourceSearch',h.sandbox),'exact:clue:missing');
 assert.equal(h.client.read().stage,'deduce');assert.equal(h.requests.length,0);assert.deepEqual(h.client.read().state.board,s.board);
 assert.match(h.element('announcer').textContent,/Source A.*private draft/);assert.match(h.element('main').innerHTML,/value="clue:e1" selected/);
});
test('source B first keeps the empty A slot and same-suspect answers retain exact distinct IDs',()=>{
 const x=setup();assert.equal(pick(x.h,'e2','b'),true);assert.deepEqual(read(x).sources,[null,{kind:'clue',id:'e2'}]);
 assert.equal(pick(x.h,'e1','a'),true);assert.deepEqual(read(x).sources,[{kind:'clue',id:'e1'},{kind:'clue',id:'e2'}]);assert.equal(x.h.requests.length,0);
});
test('selecting the same evidence in both slots is explained without losing the existing draft',()=>{
 const x=setup();pick(x.h,'e1','a');const before=read(x);assert.equal(pick(x.h,'e1','b'),false);assert.deepEqual(read(x),before);assert.match(x.h.element('notice').textContent,/two different sources/);assert.equal(x.h.requests.length,0);
});
test('Analyse selection stays in place until explicit Review draft and preserves the draft on navigation',()=>{
 const x=setup(),{h}=x;pick(h,'e2','b');assert.equal(h.client.read().stage,'analyse');assert.equal(h.historyCalls.length,0);
 vm.runInNewContext('reviewCorrelationDraft()',h.sandbox);assert.equal(h.client.read().stage,'deduce');assert.equal(h.element('correlation-heading').focused,true);assert.equal(read(x).sources[1].id,'e2');assert.equal(h.requests.length,0);
});
test('controls expose only shared clues, escape IDs and names, and are absent from reveal',()=>{
 const {h}=setup();h.sandbox.record={id:'a"<',type:'clue',source:'<img onerror=x>',text:'public'};
 const html=vm.runInNewContext('evidenceSourceControls(record)',h.sandbox);assert.match(html,/data-id="a&quot;&lt;"/);assert.match(html,/&lt;img onerror=x&gt;/);assert.doesNotMatch(html,/<img onerror/);
 const board=vm.runInNewContext('boardRecords(state.board)',h.sandbox);assert.equal((board.match(/data-action="use-source-a"/g)||[]).length,2);assert.doesNotMatch(board,/PRIVATE_ONLY|QUESTION_ONLY|AI_ONLY/);
 vm.runInNewContext("state.phase='reveal'",h.sandbox);assert.doesNotMatch(vm.runInNewContext('boardRecords(state.board)',h.sandbox),/use-source|review-correlation/);
});
test('private messages, notes, missing IDs, malformed slots and inactive phases cannot become a source',()=>{
 for(const [phase,id,slot]of [['investigation','private','a'],['investigation','n1','a'],['investigation','missing','b'],['investigation','e1','c'],['lobby','e1','a'],['reveal','e1','a']]){
  const x=setup(phase);const before=read(x);assert.equal(pick(x.h,id,slot),false);assert.deepEqual(read(x),before);assert.equal(x.h.requests.length,0);
 }
});
test('accusation choices stay local even on full board and never change selected or sealed ballots',()=>{
 const x=setup('accusation');while(x.s.board.length<60)x.s.board.push({id:'n'+x.s.board.length,type:'note',text:'Synthetic note'});x.h.client.setState(x.s);x.h.client.read().state.me.vote='ben';
 vm.runInNewContext("selectedVote='martha'",x.h.sandbox);assert.equal(pick(x.h,'e1','a'),true);assert.equal(x.h.client.read().state.me.vote,'ben');assert.equal(vm.runInNewContext('selectedVote',x.h.sandbox),'martha');assert.equal(x.h.requests.length,0);
});
test('chosen source survives reload and stays scoped when the round changes',()=>{
 const x=setup();pick(x.h,'e1','a');x.h.client.ui.writeDraft(x.context,'correlation',{...read(x),text:'Earlier local theory'});
 const reloaded=clientHarness(x.s,{saved:Object.fromEntries(x.h.saved)});assert.equal(reloaded.client.ui.read(x.context).correlation.sources[0].id,'e1');
 const next=structuredClone(x.s);next.version++;next.round=2;x.h.client.applyState(next);assert.deepEqual(x.h.client.ui.read(uiContext(next)).correlation.sources,[]);assert.equal(x.h.client.ui.recoverable(uiContext(next))[0].value.text,'Earlier local theory');
});
test('a pending correlation receipt never clears a newer source choice',async()=>{
 const x=setup(),{h,context}=x,original={sources:[{kind:'case',id:'place'},{kind:'case',id:'victim'}],relation:'related',text:'Draft to send'};
 h.client.ui.writeDraft(context,'correlation',original);let release;h.sandbox.fetch=()=>new Promise(r=>release=r);
 const sending=h.client.command('/api/test',{id:'abcdefghijklmnop',type:'correlate',...original});assert.equal(pick(h,'e1','a'),true);
 release({ok:true,status:200,json:async()=>({...x.s,version:x.s.version+1})});assert.equal(await sending,true);assert.equal(read(x).text,original.text);assert.equal(read(x).sources[0].id,'e1');
});

test('manual dropdown changes synchronize card selection markers without rerendering or moving focus',()=>{
 const x=setup(),{h,context}=x;const buttons=['a','b'].flatMap(slot=>['e1','e2'].map(id=>({dataset:{action:'use-source-'+slot,id},setAttribute(key,value){this[key]=value;}})));
 h.sandbox.document.querySelectorAll=selector=>selector.includes('data-action="use-source-')?buttons:[];
 h.client.ui.writeDraft(context,'correlation',{sources:[null,{kind:'clue',id:'e2'}],relation:'related',text:'Keep'});const before=h.element('main').innerHTML;
 vm.runInNewContext('updateSourcePreviews()',h.sandbox);assert.deepEqual(buttons.map(b=>b['aria-pressed']),['false','false','false','true']);assert.equal(h.element('main').innerHTML,before);assert.equal(h.requests.length,0);
});

test('expanded previews above the board compensate the clicked evidence anchor, not absolute page scroll',()=>{
 const x=setup(),{h}=x;let top=240,scrolled;
 const button={dataset:{action:'use-source-a',id:'e1'},getBoundingClientRect:()=>({top})};
 h.sandbox.document.querySelectorAll=selector=>selector==='[data-action="use-source-a"]'?[button]:[];
 Object.defineProperty(h.element('main'),'innerHTML',{set(){top=680;},get(){return '';},configurable:true});
 h.sandbox.scrollBy=value=>{scrolled=value;};assert.equal(pick(h,'e1','a'),true);assert.equal(scrolled.top,440);assert.equal(scrolled.behavior,'instant');assert.equal(h.requests.length,0);
});
