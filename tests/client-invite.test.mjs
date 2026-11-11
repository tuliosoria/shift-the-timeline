import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
const evaluate=(h,code)=>vm.runInNewContext(code,h.sandbox);
test('valid invitation prefills join without a request, invalid fragments are ignored',()=>{
 for(const hash of ['#join=abcd2345','#join=ABCD2345']){const h=clientHarness(clientState(),{location:{hash}});assert.equal(evaluate(h,'invitedRoom'),'ABCD2345');assert.equal(evaluate(h,'entryMode'),'join');assert.match(evaluate(h,'landing()'),/id="join-code" name="code" value="ABCD2345"/);assert.equal(h.requests.length,0);}
 for(const hash of ['#analyse','#join=SHORT','#join=ABCD2340','#join=ABCD2345&token=secret','#join=%3Cscript%3E']){const h=clientHarness(clientState(),{location:{hash}});assert.equal(evaluate(h,'invitedRoom'),'');assert.equal(evaluate(h,'entryMode'),'create');}
});
test('existing identity and pending work take precedence over invitations',()=>{
 for(const saved of [{'shift-session':JSON.stringify({code:'WXYZ2345',playerId:'p1'})},{'shift-pending':JSON.stringify({path:'/api/rooms',entry:true})},{'shift-pending':JSON.stringify({path:'/api/rooms/WXYZ2345/join',entry:true})}]){const h=clientHarness(clientState(),{saved,location:{hash:'#join=ABCD2345'}});assert.equal(evaluate(h,'invitedRoom'),'');assert.equal(h.requests.length,0);for(const [key,value] of Object.entries(saved))assert.equal(h.saved.get(key),value);}
});
test('copied link contains only same-origin path and room code, with manual-copy fallback',async()=>{
 const h=clientHarness(clientState(),{location:{origin:'https://shift.example',pathname:'/play',search:'?token=secret',hash:'#interrogate'}});let copied;h.sandbox.navigator.clipboard.writeText=async value=>{copied=value;};await evaluate(h,'copyInvite()');assert.equal(copied,'https://shift.example/play#join=ABCDEFGH');assert.equal(h.requests.length,0);
 h.sandbox.navigator.clipboard.writeText=async()=>{throw Error('Denied');};let selected=false;h.element('invite-link').select=()=>{selected=true;};await evaluate(h,'copyInvite()');assert.equal(selected,true);assert.equal(h.element('invite-link').focused,true);assert.match(h.element('notice').textContent,/manually/);
});
test('leaving the room clears any invitation prefill',()=>{const h=clientHarness(clientState(),{location:{hash:'#join=ABCD2345'}});h.client.resetSession();assert.equal(evaluate(h,'invitedRoom'),'');assert.equal(h.requests.length,0);});
test('same-document invite navigation respects identity and pending work',()=>{
 const h=clientHarness(clientState(),{location:{hash:'#join=ABCD2345'}});assert.equal(evaluate(h,'openInvitation()'),false);
 evaluate(h,"state=null;session=null;pending={entry:true};invitedRoom='';");assert.equal(evaluate(h,'openInvitation()'),false);assert.equal(evaluate(h,'invitedRoom'),'');
 evaluate(h,'pending=null');assert.equal(evaluate(h,'openInvitation()'),true);assert.equal(h.element('join-code').value,'ABCD2345');assert.equal(h.requests.length,0);
});
