import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';

const selectedState=()=>{
 const s=clientState({version:3});
 s.me.interviews=[{round:1,suspectId:'ben',opening:'Synthetic opening',closed:false,messages:[]}];
 return s;
};
test('browser-style stage navigation dismisses an unconfirmed choice without sending it',async()=>{
 const h=clientHarness(clientState());
 h.client.navigate('analyse');h.client.openConfirmation('select',{suspectId:'ben'});
 assert.equal(h.element('confirm-dialog').open,true);
 h.client.navigate('deduce',{history:'none'});
 assert.equal(h.element('confirm-dialog').open,false);
 assert.equal(h.client.read().confirmation,null);
 await h.client.confirmAction();
 assert.equal(h.requests.length,0);assert.equal(h.client.read().stage,'deduce');
});
test('a delayed confirmed selection does not override a newer navigation',async()=>{
 const h=clientHarness(clientState());let resolve;
 h.sandbox.fetch=()=>new Promise(r=>resolve=r);
 h.client.openConfirmation('select',{suspectId:'ben'});
 const selecting=h.client.confirmAction();
 h.client.navigate('deduce',{history:'none'});
 resolve({ok:true,status:200,json:async()=>selectedState()});
 assert.equal(await selecting,true);
 assert.equal(h.client.read().state.me.interviews[0].suspectId,'ben');
 assert.equal(h.client.read().stage,'deduce');
 assert.equal(h.historyCalls.filter(c=>c[0]==='push').length,0);
});
test('leaving and returning to the same stage still cancels a delayed automatic redirect',async()=>{
 const h=clientHarness(clientState());let resolve;
 h.sandbox.fetch=()=>new Promise(r=>resolve=r);
 h.client.openConfirmation('select',{suspectId:'ben'});const selecting=h.client.confirmAction();
 h.client.navigate('deduce',{history:'none'});h.client.navigate('analyse',{history:'none'});
 resolve({ok:true,status:200,json:async()=>selectedState()});await selecting;
 assert.equal(h.client.read().stage,'analyse');assert.equal(h.historyCalls.length,0);
});
test('normal selection still opens the interview when navigation has not changed',async()=>{
 const h=clientHarness(clientState());
 h.sandbox.fetch=async()=>({ok:true,status:200,json:async()=>selectedState()});
 h.client.openConfirmation('select',{suspectId:'ben'});assert.equal(await h.client.confirmAction(),true);
 assert.equal(h.client.read().stage,'interrogate');assert.equal(h.historyCalls.length,1);
});
test('a newer round in the selection response keeps the authoritative Analyse stage',async()=>{
 const h=clientHarness(clientState());const next=selectedState();next.round=2;next.me.interviews[0].closed=true;
 h.sandbox.fetch=async()=>({ok:true,status:200,json:async()=>next});
 h.client.openConfirmation('select',{suspectId:'ben'});await h.client.confirmAction();
 assert.equal(h.client.read().stage,'analyse');assert.equal(h.historyCalls.some(c=>c[0]==='push'),false);
});
test('Back dismisses irreversible accusation and shared-evidence confirmations too',async()=>{
 for(const kind of ['vote','share']){
  const s=selectedState();s.phase='accusation';s.me.interviews[0].messages=[{id:'m1',answer:'Private evidence'}];
  const h=clientHarness(s);h.client.openConfirmation(kind,kind==='vote'?{suspectId:'ben'}:{messageId:'m1'});
  assert.ok(h.client.read().confirmation);h.client.navigate('deduce',{history:'none'});await h.client.confirmAction();
  assert.equal(h.requests.length,0);assert.equal(h.element('confirm-dialog').open,false);
 }
});
