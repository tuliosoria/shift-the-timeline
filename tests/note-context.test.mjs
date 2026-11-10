import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {GameService} from '../server/game.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
import {appSource} from './helpers/client-harness.mjs';
function game(){const g=new GameService({caseData:TRAIN_CASE,catalog:CASES}),a=g.create('Host','demo',randomUUID());g.join(a.code,'Second',randomUUID());g.join(a.code,'Third',randomUUID());const act=(type,rest={})=>g.act(a.code,a.token,{id:randomUUID(),type,...rest});act('start');return {g,a,act};}
test('a delayed context-bound note is rejected rather than attributed to the next round',()=>{
 const {g,a,act}=game();act('advance',{round:1,confirmed:true});assert.throws(()=>act('note',{round:1,expectedPhase:'investigation',text:'Old draft'}),e=>e.status===409);assert.equal(g.view(a.code,a.token).board.length,0);
});
test('note receipts survive transition but partial or stale phase contexts are rejected',()=>{
 const {g,a,act}=game(),request={id:randomUUID(),type:'note',round:1,expectedPhase:'investigation',text:'Confirmed in round one'};
 const original=g.act(a.code,a.token,request).board[0];act('advance',{round:1,confirmed:true});const replay=g.act(a.code,a.token,request);assert.deepEqual(replay.board,[original]);assert.equal(replay.round,2);
 assert.throws(()=>act('note',{round:2,text:'Missing phase'}));assert.throws(()=>act('note',{expectedPhase:'investigation',text:'Missing round'}));
 act('advance',{round:2,confirmed:true});act('advance',{round:3,confirmed:true});assert.throws(()=>act('note',{round:3,expectedPhase:'investigation',text:'Old phase'}),e=>e.status===409);
});
test('legacy notes without context remain supported explicitly',()=>{
 const {act}=game();const state=act('note',{text:'Legacy note'});assert.equal(state.board[0].round,1);assert.equal(state.board[0].text,'Legacy note');
});
test('the actual note form binds its submission to the displayed round and phase',async()=>{
 let handler,payload;const submit=appSource.slice(appSource.indexOf("document.addEventListener('submit'"),appSource.indexOf("document.addEventListener('input'"));
 const sandbox={document:{addEventListener(_event,fn){handler=fn;}},busy:false,pending:null,state:{round:2,phase:'investigation'},act:async(type,data)=>{payload={type,...data};},FormData:class{*[Symbol.iterator](){yield ['text','Bound draft'];}},Object};
 vm.runInNewContext(submit,sandbox);await handler({preventDefault(){},target:{id:'note-form'}});assert.deepEqual(payload,{type:'note',text:'Bound draft',round:2,expectedPhase:'investigation'});
});
