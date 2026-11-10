import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
function playing(count=3){return clientState({me:{id:'p1',name:'Agent One',host:true,vote:null,interviews:[{round:1,suspectId:'ben',opening:'Public opening',closed:false,messages:Array.from({length:count},(_,i)=>({id:`m${i}`,question:`Question ${i}`,answer:`Answer ${i}`,topic:['clue','alibi','motive'][i]}))}]}});}
function setup(){const initial=playing(),h=clientHarness(initial);h.client.navigate('interrogate');h.sandbox.document.activeElement={closest:selector=>selector==='#question-form'?{}:null};return {initial,h};}
function response(initial){const next=structuredClone(initial);next.version++;next.me.interviews[0].messages.push({id:'final',question:'Last question',answer:'Final canonical answer',topic:'relationship'});return {ok:true,status:200,json:async()=>next};}
test('fourth accepted question hands lost composer focus to its returned answer',async()=>{
 const {initial,h}=setup();h.sandbox.fetch=async()=>response(initial);
 assert.equal(await h.client.command('/api/test',{id:'focus-request-xxxx',type:'ask',question:'Last question',round:1}),true);
 assert.equal(h.element('answer-final').focused,true);assert.doesNotMatch(h.element('main').innerHTML,/id="question-form"/);
});
test('navigation or focus elsewhere during the request is respected',async()=>{
 for(const change of ['stage','control']){const {initial,h}=setup();let resolve;h.sandbox.fetch=()=>new Promise(r=>resolve=r);
 const request=h.client.command('/api/test',{id:'focus-request-xxxx',type:'ask',question:'Last question',round:1});
 if(change==='stage')h.client.navigate('deduce');else h.sandbox.document.activeElement={closest:()=>null};
 resolve(response(initial));await request;assert.notEqual(h.element('answer-final').focused,true,change);
 }
});
test('background state updates and rejected questions never move focus to an answer',async()=>{
 const {initial,h}=setup();h.client.applyState(await response(initial).json());assert.notEqual(h.element('answer-final').focused,true);
 const rejected=setup().h;rejected.sandbox.fetch=async()=>({ok:false,status:409,json:async()=>({error:'Already covered'})});
 assert.equal(await rejected.client.command('/api/test',{id:'focus-request-xxxx',type:'ask',question:'Last question',round:1}),false);assert.notEqual(rejected.element('answer-final').focused,true);
});
test('ordinary answers retain the still-existing question controls',async()=>{
 const initial=playing(1),h=clientHarness(initial);h.client.navigate('interrogate');h.sandbox.document.activeElement={closest:()=>({})};h.sandbox.fetch=async()=>response(initial);
 await h.client.command('/api/test',{id:'focus-request-xxxx',type:'ask',question:'Last question',round:1});assert.notEqual(h.element('answer-final').focused,true);assert.match(h.element('main').innerHTML,/id="question-form"/);
});
test('retry outside the composer does not steal focus and a new round is not refocused',async()=>{
 const {initial,h}=setup();let attempts=0;h.sandbox.fetch=async()=>{if(!attempts++)throw Error('Offline');return response(initial);};
 const body={id:'focus-request-xxxx',type:'ask',question:'Last question',round:1};assert.equal(await h.client.command('/api/test',body),false);
 h.sandbox.document.activeElement={closest:()=>null};assert.equal(await h.client.runPending(),true);assert.notEqual(h.element('answer-final').focused,true);
 const next=setup();next.h.sandbox.fetch=async()=>{const r=response(next.initial),state=await r.json();state.round=2;return {...r,json:async()=>state};};
 await next.h.client.command('/api/test',body);assert.notEqual(next.h.element('answer-final').focused,true);
});
test('disabling the focused Send button may blur to body without losing answer handoff',async()=>{
 const {initial,h}=setup();const send={dataset:{},set disabled(value){if(value)h.sandbox.document.activeElement=h.sandbox.document.body;}};
 h.sandbox.document.querySelectorAll=selector=>selector==='[data-submit]'?[send]:[];h.sandbox.fetch=async()=>response(initial);
 await h.client.command('/api/test',{id:'focus-request-xxxx',type:'ask',question:'Last question',round:1});assert.equal(h.element('answer-final').focused,true);
});

test('a later focus move followed by blur is not mistaken for the disabled Send blur',async()=>{
 const {initial,h}=setup();let resolve;h.sandbox.fetch=()=>new Promise(r=>resolve=r);
 const request=h.client.command('/api/test',{id:'focus-request-xxxx',type:'ask',question:'Last question',round:1});
 vm.runInNewContext('focusVersion++',h.sandbox);h.sandbox.document.activeElement=h.sandbox.document.body;
 resolve(response(initial));await request;assert.notEqual(h.element('answer-final').focused,true);
});
