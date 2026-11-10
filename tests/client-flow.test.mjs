import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
const interview={round:1,suspectId:'ben',opening:'Synthetic opening',closed:false,messages:[{id:'private-message',question:'PRIVATE QUESTION',answer:'Canonical test evidence',topic:'clue',narration:{status:'complete',text:'PRIVATE NARRATION'}}]};
const playing=()=>clientState({me:{id:'p1',name:'Agent One',host:true,interviews:[structuredClone(interview)],vote:null}});
test('moving between stages and history never posts or closes an interview',()=>{
 const h=clientHarness(playing());h.client.navigate('deduce',{history:'push',focus:true});h.client.navigate('interrogate',{history:'none',focus:false});
 assert.equal(h.requests.length,0);assert.equal(h.client.read().state.me.interviews[0].closed,false);assert.equal(h.historyCalls.length,1);
});
test('stage changes preserve scoped question drafts when the composer unmounts',()=>{
 const h=clientHarness(playing());h.client.navigate('interrogate');h.element('question').value='Keep across stages';h.element('question').dataset.draft='question';
 h.sandbox.document.querySelectorAll=selector=>selector==='[data-draft]'?[h.element('question')]:[];
 h.client.navigate('deduce');assert.equal(h.client.ui.read({room:'ABCDEFGH',player:'p1',round:1,phase:'investigation',suspect:'ben'}).question,'Keep across stages');
});
test('select confirmation sends nothing until accepted and then navigates only after success',async()=>{
 const h=clientHarness(clientState());h.client.openConfirmation('select',{suspectId:'ben'});assert.equal(h.requests.length,0);
 h.sandbox.fetch=async(path,options)=>{h.requests.push({path,body:JSON.parse(options.body)});return {ok:true,status:200,json:async()=>playing()};};
 await h.client.confirmAction();assert.equal(h.requests[0].body.type,'select');assert.equal(h.client.read().stage,'interrogate');
});
test('finish round is a distinct confirmation and is invalidated by a new round',async()=>{
 const h=clientHarness(playing());h.client.navigate('deduce');assert.equal(h.requests.length,0);h.client.openConfirmation('end',{});
 h.client.applyState({...playing(),version:3,round:2,remainingHours:16});await h.client.confirmAction();
 assert.equal(h.requests.length,0);assert.equal(h.client.read().stage,'analyse');assert.equal(h.client.read().confirmation,null);
});
test('share preview contains only canonical evidence and shares its opaque message ID',async()=>{
 const h=clientHarness(playing());h.client.openConfirmation('share',{messageId:'private-message'});
 const html=h.element('confirm-body').innerHTML;assert.match(html,/Canonical test evidence/);assert.ok(!html.includes('PRIVATE QUESTION'));assert.ok(!html.includes('PRIVATE NARRATION'));
 await h.client.confirmAction();assert.equal(h.requests[0].body.messageId,'private-message');assert.equal(h.requests[0].body.type,'share');assert.ok(!JSON.stringify(h.requests[0].body).includes('Canonical test evidence'));
});
test('correlation public sources exclude private messages notes and other hypotheses',()=>{
 const h=clientHarness(playing());h.client.applyState({...playing(),version:3,board:[{id:'clue-1',type:'clue',source:'Ben',text:'PUBLIC CLUE',round:1,by:'Agent Two'},{id:'note-1',type:'note',text:'NOT EVIDENCE',round:1,by:'Agent Two'}]});
 const sources=h.client.publicSources();assert.ok(sources.some(s=>s.kind==='clue'&&s.id==='clue-1'));assert.ok(!sources.some(s=>s.id==='private-message'||s.id==='note-1'));assert.ok(!JSON.stringify(sources).includes('PRIVATE QUESTION'));
});
test('invalid identical correlation sources never open a mutation confirmation',()=>{
 const h=clientHarness(playing());h.client.openConfirmation('correlate',{sources:[{kind:'case',id:'place'},{kind:'case',id:'place'}],relation:'related',text:'Test hypothesis'});
 assert.equal(h.client.read().confirmation,null);assert.equal(h.requests.length,0);
});
test('full board prevents another correlation without destroying the local hypothesis',()=>{
 const s=playing();s.board=Array.from({length:60},(_,i)=>({id:'n'+i,type:'note',text:'Test note',by:'Agent',round:1}));const h=clientHarness(s);
 h.client.openConfirmation('correlate',{sources:[{kind:'case',id:'place'},{kind:'suspect',id:'ben'}],relation:'related',text:'Keep my hypothesis'});
 assert.equal(h.client.read().confirmation,null);assert.equal(h.requests.length,0);assert.match(h.element('notice').textContent,/full/i);
});
test('polling state cannot regress version or switch the active room',()=>{
 const h=clientHarness(playing());h.client.applyState({...playing(),version:1,round:2});assert.equal(h.client.read().state.round,1);
 h.client.applyState({...playing(),code:'OTHER123',version:99});assert.equal(h.client.read().state.code,'ABCDEFGH');
});
test('all player-entered content is escaped and hypotheses are not labelled evidence',()=>{
 const s=playing();s.board=[{id:'c1',type:'correlation',sources:[{kind:'case',id:'place'},{kind:'suspect',id:'ben'}],relation:'supports',text:'<script>attack</script>',by:'<svg>',round:1}];
 const h=clientHarness(s);h.client.navigate('deduce');const html=h.element('main').innerHTML;assert.match(html,/Team hypothesis/);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
test('expired identity clears only its local private state',()=>{
 const h=clientHarness(playing());const c={room:'ABCDEFGH',player:'p1',round:1,phase:'investigation',suspect:'ben'};h.client.ui.writeDraft(c,'question','Local private text');
 h.client.resetSession();assert.equal(h.client.ui.read(c).question,'');assert.equal(h.client.read().state,null);
});
test('confirmed old question does not clear a newer edit even when on another stage',async()=>{
 const h=clientHarness(playing());const c={room:'ABCDEFGH',player:'p1',round:1,phase:'investigation',suspect:'ben'};
 h.client.ui.writeDraft(c,'question','Question sent');let resolve;h.sandbox.fetch=()=>new Promise(r=>resolve=r);
 const sending=h.client.command('/api/test',{id:'abcdefghijklmnop',type:'ask',round:1,question:'Question sent'});h.client.ui.writeDraft(c,'question','Newer draft');h.client.navigate('deduce');
 resolve({ok:true,status:200,json:async()=>({...playing(),version:3})});await sending;assert.equal(h.client.ui.read(c).question,'Newer draft');
});
test('render keeps an expanded note panel open across polling replacement',()=>{
 const h=clientHarness(playing()),panel={id:'team-note-panel',open:true};
 h.sandbox.document.querySelectorAll=selector=>selector==='details[id]'?[panel]:[];
 h.sandbox.document.getElementById=id=>id==='team-note-panel'?panel:h.element(id);
 Object.defineProperty(h.element('main'),'innerHTML',{set(){panel.open=false;},get(){return '';},configurable:true});
 h.client.render();assert.equal(panel.open,true);
});
test('polling restores keyboard focus on a replaced suspect button without an HTML id',()=>{
 const h=clientHarness(playing());const old={id:'',dataset:{focusKey:'action:dossier:ben'}};let replacement={dataset:{focusKey:'action:dossier:ben'},focus(){this.focused=true;}};
 h.sandbox.document.activeElement=old;h.sandbox.document.querySelectorAll=selector=>selector==='[data-focus-key]'?[replacement]:[];
 Object.defineProperty(h.element('main'),'innerHTML',{set(){replacement={dataset:{focusKey:'action:dossier:ben'},focus(){this.focused=true;}};},get(){return '';},configurable:true});
 h.client.applyState({...playing(),version:3});assert.equal(replacement.focused,true);
});
test('cancelling a confirmation returns focus to its non-id trigger',()=>{
 const h=clientHarness(clientState()),trigger={id:'',dataset:{focusKey:'action:select:ben'},focus(){this.focused=true;}};
 h.sandbox.document.activeElement=trigger;h.sandbox.document.querySelectorAll=selector=>selector==='[data-focus-key]'?[trigger]:[];
 h.client.openConfirmation('select',{suspectId:'ben'});h.client.closeConfirmation();assert.equal(trigger.focused,true);assert.equal(h.requests.length,0);
});
test('modal Tab and Shift+Tab wrap between enabled controls',()=>{
 const h=clientHarness(playing());assert.equal(typeof h.client.trapDialogFocus,'function');
 const first={focus(){this.focused=true;}},last={focus(){this.focused=true;}};h.element('confirm-dialog').querySelectorAll=()=>[first,last];
 let prevented=0;h.sandbox.document.activeElement=last;h.client.trapDialogFocus({key:'Tab',shiftKey:false,preventDefault(){prevented++;}});assert.equal(first.focused,true);
 h.sandbox.document.activeElement=first;h.client.trapDialogFocus({key:'Tab',shiftKey:true,preventDefault(){prevented++;}});assert.equal(last.focused,true);assert.equal(prevented,2);
});
test('reload cannot inherit a prior round fragment instead of the new Analyse default',()=>{
 const h=clientHarness(playing());h.client.ui.setStage({room:'ABCDEFGH',player:'p1',round:1,phase:'investigation',suspect:'ben'},'deduce');
 h.client.clearState();h.sandbox.location.hash='#deduce';h.client.applyState({...playing(),version:3,round:2});assert.equal(h.client.read().stage,'analyse');
});
test('a new round without a selected suspect has an empty current interview and explicit history',()=>{
 const s=playing();s.round=2;s.me.interviews[0].closed=true;const h=clientHarness(s);h.client.navigate('interrogate');const html=h.element('main').innerHTML;
 assert.match(html,/Choose a suspect/);assert.match(html,/Interview history/);assert.match(html,/Round 1/);assert.ok(!html.includes('Synthetic opening'));
});
test('a storage failure during play visibly warns that drafts are only retained in the open tab',()=>{
 const h=clientHarness(playing());h.sandbox.sessionStorage.setItem=()=>{throw Error('quota exceeded');};h.client.ui.writeDraft({room:'ABCDEFGH',player:'p1',round:1,phase:'investigation',suspect:'ben'},'question','My unsent question');h.client.render();
 assert.match(h.element('storage-notice').textContent,/keep this tab open/i);assert.match(h.element('storage-notice').textContent,/draft/i);
});
