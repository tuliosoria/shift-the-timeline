import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../public/ui-state.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const context = {room:'ABCDEFGH', player:'agent-1', round:1, phase:'investigation', suspect:'ben'};
const memory = () => { const data = new Map(); return {getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,value), removeItem:key=>data.delete(key)}; };
function store(storage=memory()) { assert.equal(typeof module.createUiState,'function','UI state API exists'); return module.createUiState(storage); }
test('an unsent question survives a reload in the same interview',()=>{
 const storage=memory(),ui=store(storage);ui.writeDraft(context,'Where were you?');
 assert.equal(ui.draft(context),'Where were you?');assert.equal(store(storage).draft(context),'Where were you?');
});
test('question drafts cannot cross room, player, suspect or turn',()=>{
 const ui=store();ui.writeDraft(context,'Private draft');
 for(const diff of [{room:'OTHER123'},{player:'agent-2'},{round:2},{suspect:'martha'}])assert.equal(ui.draft({...context,...diff}),'');
});
test('a delayed acknowledgement cannot clear a newer draft or another suspect draft',()=>{
 const ui=store();ui.writeDraft(context,'Sent first');ui.writeDraft(context,'Edited later');
 ui.clearMatchingDraft(context,'Sent first');assert.equal(ui.draft(context),'Edited later');
 ui.writeDraft({...context,suspect:'martha'},'Different question');ui.clearMatchingDraft(context,'Edited later');
 assert.equal(ui.draft(context),'');assert.equal(ui.draft({...context,suspect:'martha'}),'Different question');
});
test('seen flags start unseen, only move forward and survive a reload',()=>{
 const storage=memory(),ui=store(storage);
 assert.deepEqual(ui.seen('ABCDEFGH','agent-1'),{briefingSeen:false,lastSeenRound:0});
 ui.markSeen('ABCDEFGH','agent-1',{briefingSeen:true,lastSeenRound:2});ui.markSeen('ABCDEFGH','agent-1',{briefingSeen:false,lastSeenRound:1});
 assert.deepEqual(store(storage).seen('ABCDEFGH','agent-1'),{briefingSeen:true,lastSeenRound:2});
 assert.deepEqual(ui.seen('ABCDEFGH','agent-2'),{briefingSeen:false,lastSeenRound:0});
});
test('forget removes only the selected identity',()=>{
 const ui=store();ui.writeDraft(context,'Mine');ui.writeDraft({...context,player:'agent-2'},'Theirs');ui.markSeen(context.room,context.player,{briefingSeen:true,lastSeenRound:1});
 ui.forget(context.room,context.player);assert.equal(ui.draft(context),'');assert.deepEqual(ui.seen(context.room,context.player),{briefingSeen:false,lastSeenRound:0});
 assert.equal(ui.draft({...context,player:'agent-2'}),'Theirs');
});
test('unavailable or corrupt storage keeps a usable in-memory draft',()=>{
 for(const storage of [{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}, {getItem(){return '{bad json';},setItem(){throw Error('quota');}}]){
  const ui=store(storage);ui.writeDraft(context,'Keep in this tab');ui.markSeen(context.room,context.player,{briefingSeen:true});
  assert.equal(ui.draft(context),'Keep in this tab');assert.equal(ui.seen(context.room,context.player).briefingSeen,true);assert.equal(ui.persistent,false);
 }
});
test('malformed persisted values cannot supply drafts, flags or foreign properties',()=>{
 const storage=memory();storage.setItem('shift-ui-v2',JSON.stringify({version:2,drafts:[{context:{room:'ABCDEFGH',player:'agent-1',round:1,suspect:'ben'},value:42},{context:{room:'ABCDEFGH',player:'agent-1',round:1,suspect:'ben'},value:'x'.repeat(20000)}],seen:[{room:'ABCDEFGH',player:'agent-1',briefingSeen:'yes',lastSeenRound:'<script>'},{room:'__proto__',player:'x',briefingSeen:true,lastSeenRound:1}]}));
 const ui=store(storage);assert.equal(ui.draft(context).length,10000);assert.deepEqual(ui.seen('ABCDEFGH','agent-1'),{briefingSeen:false,lastSeenRound:0});assert.equal({}.briefingSeen,undefined);
});
test('context derives the current authoritative interview rather than the previous turn',()=>{
 assert.equal(typeof module.uiContext,'function');
 assert.deepEqual(module.uiContext({code:'ABCDEFGH',round:2,phase:'investigation',me:{id:'agent-1',interviews:[{round:1,suspectId:'ben'}]}}),{room:'ABCDEFGH',player:'agent-1',round:2,phase:'investigation',suspect:null});
 assert.equal(module.uiContext(null),null);
});
