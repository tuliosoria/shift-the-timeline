import test from 'node:test';
import assert from 'node:assert/strict';
import {GameService} from '../server/game.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {caseData,catalog,reviewRoutes} from '../examples/public-demo.mjs';
let serial=0;const request=()=>`public-demo-${++serial}-request`;
function setup(count=3){const g=new GameService({caseData,catalog}),host=g.create('A',caseData.id,request()),players=[host];for(let i=1;i<count;i++)players.push(g.join(host.code,`Agent ${i}`,request()));return{g,host,players,act:(p,type,data={})=>g.act(host.code,p.token,{id:request(),type,...data})};}
test('public authored demo validates separately from synthetic and private cases',()=>{const result=validateCase({caseData,catalog});assert.equal(result.caseData.suspects.length,15);assert.notEqual(caseData.id,'demo');assert.match(catalog[0].description,/public/i);assert.ok(reviewRoutes.length>=3);assert.equal(new Set(caseData.suspects.map(s=>s.id)).size,15);});
for(const route of reviewRoutes)test(`authored route is mechanically available without AI: ${route.name}`,()=>{
 assert.ok(route.interviews.length<=6);assert.ok(route.interviews.length>=2);const unique=new Set(route.interviews.map(i=>i.suspectId));assert.equal(unique.size,route.interviews.length);
 const s=setup();s.act(s.host,'start');let cursor=0,obtained=[];
 for(let round=1;round<=3;round++)for(const player of s.players){
  const interview=route.interviews[cursor++];const suspectId=interview?.suspectId??caseData.suspects[0].id;
  s.act(player,'select',{round,suspectId});
  if(interview){assert.ok(interview.topics.length<=4);assert.equal(new Set(interview.topics).size,interview.topics.length);for(const topic of interview.topics){
   s.act(player,'ask',{round,topic,question:`Tell me about ${topic}.`});
   const answer=s.g.view(s.host.code,player.token).me.interviews.find(i=>i.round===round).messages.at(-1);
   assert.equal(answer.answer,caseData.suspects.find(x=>x.id===suspectId).responses[topic]);assert.equal(answer.narration,undefined);obtained.push(answer.answer);
   const other=s.players.find(x=>x!==player);assert.ok(!JSON.stringify(s.g.view(s.host.code,other.token)).includes(answer.id));
   s.act(player,'share',{round,messageId:answer.id});assert.ok(s.g.view(s.host.code,other.token).board.some(n=>n.messageId===answer.id));
  }}s.act(player,'end',{round});
 }
 assert.ok(obtained.length>0);assert.equal(s.g.view(s.host.code,s.host.token).phase,'accusation');
 // This verifies outcome plumbing, not that an automated solver deduced guilt.
 for(const p of s.players)s.act(p,'vote',{suspectId:caseData.culpritId});
 assert.equal(s.g.view(s.host.code,s.host.token).phase,'reveal');
});
test('public source availability does not expose solution in pre-reveal game state',()=>{const s=setup(4);s.act(s.host,'start');for(const p of s.players){const state=JSON.stringify(s.g.view(s.host.code,p.token));for(const secret of ['culpritId','responses',caseData.solution.plan])assert.ok(!state.includes(secret));}});
test('demo source and spoiler notes are not added to served web assets',async()=>{const {publicAsset}=await import('../server/public-assets.mjs');for(const url of ['/examples/public-demo.mjs','/examples/public-demo-notes.md','/public-demo.mjs'])assert.equal(publicAsset(url),undefined);});
for(const outcome of ['complete','partial','defeat'])test(`four-player demo reveal supports ${outcome} outcome`,()=>{const s=setup(4);s.act(s.host,'start');for(let round=1;round<=3;round++)for(const p of s.players){s.act(p,'select',{round,suspectId:caseData.suspects[0].id});s.act(p,'end',{round});}const innocent=caseData.suspects.find(p=>p.id!==caseData.culpritId).id;for(let i=0;i<s.players.length;i++)s.act(s.players[i],'vote',{suspectId:outcome==='complete'||outcome==='partial'&&i===0?caseData.culpritId:innocent});const result=s.g.view(s.host.code,s.host.token).result;assert.equal(result.outcome,outcome);assert.deepEqual(result.solution,caseData.solution);});
