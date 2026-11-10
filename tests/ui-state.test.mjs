import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../public/ui-state.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const context = {room:'ABCDEFGH', player:'agent-1', round:1, phase:'investigation', suspect:'ben'};
const memory = () => { const data = new Map(); return {getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,value), removeItem:key=>data.delete(key)}; };
function store(storage=memory()) { assert.equal(typeof module.createUiState,'function','UI state API exists'); return module.createUiState(storage); }
test('stage and unsent question survive navigation and a reload in the same context',()=>{
 const storage=memory(),ui=store(storage);ui.writeDraft(context,'question','Where were you?');ui.setStage(context,'deduce');
 assert.equal(ui.read(context).stage,'deduce');assert.equal(ui.read(context).question,'Where were you?');
 const restored=store(storage);assert.equal(restored.read(context).question,'Where were you?');assert.equal(restored.read(context).stage,'deduce');
});
test('question drafts cannot cross room player suspect or round',()=>{
 const ui=store();ui.writeDraft(context,'question','Private draft');ui.setStage(context,'interrogate');
 for(const diff of [{room:'OTHER123'},{player:'agent-2'},{round:2},{suspect:'martha'}])assert.equal(ui.read({...context,...diff}).question,'');
 assert.equal(ui.read({...context,round:2}).stage,'analyse');
});
test('a delayed acknowledgement cannot clear a newer draft or another suspect draft',()=>{
 const ui=store();ui.writeDraft(context,'question','Sent first');ui.writeDraft(context,'question','Edited later');
 ui.clearMatchingDraft(context,'question','Sent first');assert.equal(ui.read(context).question,'Edited later');
 ui.writeDraft({...context,suspect:'martha'},'question','Different question');ui.clearMatchingDraft(context,'question','Edited later');
 assert.equal(ui.read(context).question,'');assert.equal(ui.read({...context,suspect:'martha'}).question,'Different question');
});
test('team note and structured correlation are available between suspects only within same round',()=>{
 const ui=store(),draft={sources:[{kind:'case',id:'place'},{kind:'suspect',id:'ben'}],relation:'related',text:'Perhaps connected'};
 ui.writeDraft(context,'note','Team note');ui.writeDraft(context,'correlation',draft);draft.text='External mutation';
 assert.equal(ui.read({...context,suspect:'martha'}).note,'Team note');assert.equal(ui.read(context).correlation.text,'Perhaps connected');
 assert.equal(ui.read({...context,round:2}).note,'');assert.equal(ui.read({...context,round:2}).correlation.text,'');
});
test('old-round draft recovery is labelled and does not alter the new round',()=>{
 const ui=store();ui.writeDraft(context,'question','Old round');ui.writeDraft(context,'note','Old note');
 const recovered=ui.recoverable({...context,round:2});assert.equal(recovered.length,2);assert.ok(recovered.every(d=>d.round===1));
 assert.equal(ui.read({...context,round:2}).question,'');assert.equal(ui.read({...context,round:2}).note,'');
});
test('forget removes only the selected identity and cannot return its recovery drafts',()=>{
 const ui=store();ui.writeDraft(context,'question','Mine');ui.writeDraft({...context,player:'agent-2'},'question','Theirs');
 ui.forget(context.room,context.player);assert.equal(ui.read(context).question,'');assert.deepEqual(ui.recoverable({...context,round:2}),[]);
 assert.equal(ui.read({...context,player:'agent-2'}).question,'Theirs');
});
test('unavailable or corrupt storage keeps a usable in-memory draft without leaking values in URLs',()=>{
 for(const storage of [{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}, {getItem(){return '{bad json';},setItem(){throw Error('quota');}}]){
  const ui=store(storage);ui.writeDraft(context,'question','Keep in this tab');ui.setStage(context,'deduce');
  assert.equal(ui.read(context).question,'Keep in this tab');assert.equal(ui.read(context).stage,'deduce');assert.equal(ui.persistent,false);
 }
});
test('malformed persisted values cannot supply stages or inject foreign object properties',()=>{
 const storage=memory();storage.setItem('shift-ui-v1',JSON.stringify({entries:[{room:'ABCDEFGH',player:'agent-1',round:1,stage:'<script>',drafts:{question:42}}]}));
 const ui=store(storage);assert.equal(ui.read(context).stage,'analyse');assert.equal(ui.read(context).question,'');
});
test('context derives the current authoritative interview rather than the previous round',()=>{
 assert.equal(typeof module.uiContext,'function');
 assert.deepEqual(module.uiContext({code:'ABCDEFGH',round:2,phase:'investigation',me:{id:'agent-1',interviews:[{round:1,suspectId:'ben'}]}}),{room:'ABCDEFGH',player:'agent-1',round:2,phase:'investigation',suspect:null});
});
test('choosing source B first preserves its slot while source A is empty',()=>{
 const ui=store();ui.writeDraft(context,'correlation',{sources:[null,{kind:'suspect',id:'ben'}],relation:'related',text:'Draft'});
 assert.deepEqual(ui.read(context).correlation.sources,[null,{kind:'suspect',id:'ben'}]);
});
test('optional question topic survives reload but is scoped and never a recovered prose draft',()=>{
 const storage=memory(),ui=store(storage);ui.writeDraft(context,'questionTopic','clue');
 assert.equal(store(storage).read(context).questionTopic,'clue');
 for(const diff of [{room:'OTHER123'},{player:'agent-2'},{round:2},{suspect:'martha'},{phase:'accusation'}])assert.equal(ui.read({...context,...diff}).questionTopic,'');
 assert.deepEqual(ui.recoverable({...context,round:2}),[]);
 ui.writeDraft(context,'questionTopic','motive');ui.clearMatchingDraft(context,'questionTopic','clue');assert.equal(ui.read(context).questionTopic,'motive');
 ui.clearMatchingDraft(context,'questionTopic','motive');assert.equal(ui.read(context).questionTopic,'');
 ui.writeDraft(context,'questionTopic','__proto__');assert.equal(ui.read(context).questionTopic,'');
});
