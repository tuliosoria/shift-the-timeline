import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHarness,clientState} from './helpers/client-harness.mjs';
test('host takeover is explicit, confirmed, and unavailable to ineligible clients',async()=>{
 const s=clientState({hostRecoverable:true});s.me.host=false;const h=clientHarness(s);h.client.render();assert.match(h.element('main').innerHTML,/Take over as host/);
 h.client.openConfirmation('claimHost',{});assert.equal(h.requests.length,0);assert.match(h.element('confirm-body').innerHTML,/remain in the game/);await h.client.confirmAction();assert.equal(h.requests[0].body.type,'claimHost');assert.equal(h.requests[0].body.confirmed,true);
 const unavailable=clientHarness(clientState());unavailable.client.openConfirmation('claimHost',{});assert.equal(unavailable.client.read().confirmation,null);
});
test('missing accusation finish explains irreversible abstentions and cannot run before eligible',async()=>{
 const s=clientState({phase:'accusation',canFinalizeAccusations:true});s.me.vote='ben';const h=clientHarness(s);h.client.openConfirmation('finalizeAccusations',{});assert.equal(h.requests.length,0);assert.match(h.element('confirm-body').innerHTML,/abstentions/);assert.match(h.element('confirm-body').innerHTML,/cannot be undone/);await h.client.confirmAction();assert.equal(h.requests[0].body.type,'finalizeAccusations');assert.equal(h.requests[0].body.confirmed,true);
 const unavailable=clientHarness(clientState({phase:'accusation',canFinalizeAccusations:false}));unavailable.client.openConfirmation('finalizeAccusations',{});assert.equal(unavailable.client.read().confirmation,null);
});
test('reveal distinguishes abstentions from innocent accusations',()=>{
 const h=clientHarness(clientState({phase:'reveal',result:{outcome:'partial',culpritId:'ben',correct:1,total:3,innocentArrests:0,abstentions:2,solution:{motive:'Synthetic',plan:'Synthetic',evidence:[],timeline:[]},votes:[{playerId:'p1',suspectId:'ben',correct:true},{playerId:'p2',suspectId:null,correct:false},{playerId:'p3',suspectId:null,correct:false}]}}));h.client.render();const html=h.element('main').innerHTML;assert.match(html,/No accusation submitted/);assert.match(html,/Abstention/);assert.doesNotMatch(html,/Innocent person accused/);assert.doesNotMatch(html,/team also accused innocent/);
});
test('poll renews presence at most once per 30 seconds without storing a pending game command',async()=>{
 const h=clientHarness(clientState());let now=100000;h.sandbox.Date={now:()=>now};
 h.sandbox.fetch=async(path,options)=>{const body=options.body?JSON.parse(options.body):null;h.requests.push({path,body});return {ok:true,status:body?200:204,json:async()=>({...clientState(),version:3})};};
 await h.client.poll();assert.equal(h.requests.filter(r=>r.body?.type==='heartbeat').length,1);assert.equal(h.client.read().pending,null);
 now+=29999;await h.client.poll();assert.equal(h.requests.filter(r=>r.body?.type==='heartbeat').length,1);
 now++;await h.client.poll();assert.equal(h.requests.filter(r=>r.body?.type==='heartbeat').length,2);
});
test('finished rooms never heartbeat',async()=>{
 const h=clientHarness(clientState({phase:'reveal'}));h.sandbox.fetch=async(path,options)=>{h.requests.push({path,body:options.body});return {ok:true,status:204};};await h.client.poll();assert.equal(h.requests.length,1);assert.equal(h.requests[0].body,undefined);
});
