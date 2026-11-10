import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {clientHarness,clientState,appSource} from './helpers/client-harness.mjs';
const playing=()=>clientState({me:{id:'p1',name:'Agent One',host:true,vote:null,interviews:[{round:1,suspectId:'ben',opening:'Synthetic opening',closed:false,messages:[]}]}});
function setup(mode='ai_optional'){
 const h=clientHarness(playing(),{events:true});h.client.applyCatalogue?.({cases:[],dialogueMode:mode});h.client.navigate('interrogate');return h;
}
function choose(h,checked){const input=h.element('ai-consent');input.checked=checked;h.handlers.change({target:input});}
async function send(h,question='Synthetic question?'){await h.handlers.submit({preventDefault(){},target:{id:'question-form',data:{question}}});}
function consentTag(h){return h.element('main').innerHTML.match(/<input[^>]*id="ai-consent"[^>]*>/)?.[0];}

test('optional narration presents an unchecked informed choice while canonical play remains available',async()=>{
 const h=setup();const html=h.element('main').innerHTML;
 assert.ok(consentTag(h),'Active interview exposes its consent control');assert.doesNotMatch(consentTag(h),/\bchecked\b/);assert.doesNotMatch(consentTag(h),/\brequired\b/);
 for(const detail of [/OpenAI/,/fictional persona/,/relevant evidence/,/personal information/,/not evidence/i,/store:false/,/zero retention/i])assert.match(html,detail);
 await send(h);assert.equal(h.requests.length,1);assert.equal(Object.hasOwn(h.requests[0].body,'aiConsent'),false);
});
test('only a checked enabled interview adds boolean true to an ask',async()=>{
 const h=setup();choose(h,true);await send(h);assert.equal(h.requests[0].body.aiConsent,true);
});
test('absent unknown or canonical capability cannot opt a player into narration',async()=>{
 for(const mode of [undefined,'canonical','unexpected']){const h=setup(mode);if(mode===undefined)h.client.applyCatalogue?.({cases:[]});choose(h,true);h.client.render();assert.equal(consentTag(h),undefined);await send(h);assert.equal(Object.hasOwn(h.requests[0].body,'aiConsent'),false);}
});
test('unchecked consent is revocable for subsequent questions',async()=>{
 const h=setup();choose(h,true);choose(h,false);await send(h);assert.equal(Object.hasOwn(h.requests[0].body,'aiConsent'),false);
});
test('consent survives local navigation and polling but is scoped to the current interview',async()=>{
 const h=setup();choose(h,true);h.client.navigate('deduce');h.client.applyState({...playing(),version:3});h.client.navigate('interrogate');assert.match(consentTag(h),/\bchecked\b/);
 const next=playing();next.version=4;next.round=2;next.me.interviews.push({round:2,suspectId:'martha',opening:'Synthetic opening',messages:[],closed:false});h.client.applyState(next);h.client.navigate('interrogate');assert.doesNotMatch(consentTag(h),/\bchecked\b/);await send(h);assert.equal(Object.hasOwn(h.requests[0].body,'aiConsent'),false);
});
test('consent is never stored as a standing preference and starts unchecked after reload',()=>{
 const h=setup();choose(h,true);assert.ok(![...h.saved.values()].some(value=>value.includes('aiConsent')));
 const reloaded=setup();assert.doesNotMatch(consentTag(reloaded),/\bchecked\b/);
});
test('changing catalogue capability clears prior consent rather than reviving it later',()=>{
 const h=setup();choose(h,true);h.client.applyCatalogue?.({cases:[],dialogueMode:'canonical'});h.client.applyCatalogue?.({cases:[],dialogueMode:'ai_optional'});h.client.render();assert.doesNotMatch(consentTag(h),/\bchecked\b/);
});
test('pending retries preserve the consented body after an uncertain response and later uncheck',async()=>{
 const h=setup();choose(h,true);let attempt=0;h.sandbox.fetch=async(path,options)=>{h.requests.push({path,raw:options.body,body:JSON.parse(options.body)});if(++attempt===1)throw Error('Lost response');if(attempt===2)return {ok:false,status:429,json:async()=>({error:'Retry later'})};return {ok:true,status:200,json:async()=>({...playing(),version:3})};};
 await send(h);assert.equal(h.client.read().pending.body.aiConsent,true);choose(h,false);await h.client.runPending();await h.client.runPending();assert.equal(h.requests.length,3);assert.equal(new Set(h.requests.map(r=>r.raw)).size,1);assert.equal(h.client.read().pending,null);
});
test('consent never expands into notes or other game commands',async()=>{
 const h=setup();choose(h,true);await h.handlers.submit({preventDefault(){},target:{id:'note-form',data:{text:'Synthetic team note'}}});assert.equal(h.requests[0].body.type,'note');assert.equal(Object.hasOwn(h.requests[0].body,'aiConsent'),false);
});
test('enabled capability replaces misleading AI-off claims without claiming generation is guaranteed',()=>{
 const h=setup();assert.doesNotMatch(h.element('main').innerHTML,/Generative AI is not connected|generative AI is not active/);h.client.resetSession();assert.match(h.element('main').innerHTML,/Optional AI narration/);assert.doesNotMatch(h.element('main').innerHTML,/Generative AI is not connected/);
});

test('startup reads the top-level catalogue capability before rendering the consent choice',async()=>{
 const h=clientHarness(playing(),{events:true});h.sandbox.fetch=async path=>({ok:true,status:200,json:async()=>path==='/api/cases'?{cases:[],dialogueMode:'ai_optional'}:path==='/api/session'?{}:{...playing(),version:3}});
 const startup=appSource.slice(appSource.indexOf("try{await fetchJson('/api/session'"),appSource.indexOf('async function schedulePoll'));
 await vm.runInNewContext('(async()=>{'+startup+'})()',h.sandbox);h.client.navigate('interrogate');assert.ok(consentTag(h));
});
test('closing an interview or resetting a session cannot carry its consent into a later interview',()=>{
 const h=setup();choose(h,true);const closed=playing();closed.version=3;closed.me.interviews[0].closed=true;h.client.applyState(closed);assert.equal(consentTag(h),undefined);
 h.client.resetSession();h.client.setState(playing());h.client.navigate('interrogate');assert.doesNotMatch(consentTag(h),/\bchecked\b/);
});
