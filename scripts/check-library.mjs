// Offline mechanics only. Runs trusted local authoring modules; never contacts an AI provider.
import {randomUUID} from 'node:crypto';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {loadCase} from '../server/case-loader.mjs';import {checkCase} from './check-case.mjs';
import {DurableGame} from '../server/persistent-game.mjs';import {MemoryStore} from '../server/storage/memory.mjs';
import {buildChatContext} from '../server/ai/chat-context.mjs';
const topics=['alibi','motive','clue','relationship'];
const ensure=(condition)=>{if(!condition)throw new Error('Library mechanical check failed.');};
// Find a team route using at most three topics per interview. Re-run omitting each witness.
export function clueRoute(c,omitted=null){
 const missing=new Set(c.deductions.filter(d=>d.key).map(d=>d.id)),route=[];
 const candidates=c.suspects.filter(s=>s.id!==omitted).flatMap(s=>topics.map(exclude=>({suspectId:s.id,topics:topics.filter(t=>t!==exclude)})));
 while(missing.size){
  let best=null,gain=[];
  for(const candidate of candidates){const covers=c.deductions.filter(d=>missing.has(d.id)&&d.sources.some(s=>s.suspectId===candidate.suspectId&&candidate.topics.includes(s.topic))).map(d=>d.id);if(covers.length>gain.length){best=candidate;gain=covers;}}
  if(!best)return null;route.push(best);for(const id of gain)missing.delete(id);
 }
 return route;
}
export async function checkLibrary(data){
 const cases=data.registry?[...data.registry.current.values()]:[data.caseData],reports=[];
 for(const c of cases){
  const preflight=checkCase({caseData:c,catalog:[{id:c.id,title:c.title,available:true}]});
  for(const s of c.suspects)for(const topic of topics)buildChatContext({caseData:c,suspectId:s.id,question:topic,currentRound:1});
  const route=clueRoute(c);ensure(route&&route.length<=12);
  const missingWitnessRoutes=c.suspects.map(s=>clueRoute(c,s.id));
  const sessions=[];
  for(const count of [3,4]){
   const store=new MemoryStore(),game=new DurableGame({store,...data}),players=Array.from({length:count},()=>randomUUID());
   const {code}=await game.create(players[0],'Host',c.id,randomUUID());for(let i=1;i<count;i++)await game.join(code,players[i],`Agent ${i}`,randomUUID());
   const act=(i,type,extra={})=>game.act(code,players[i],{id:randomUUID(),type,...extra});await act(0,'start');const earned=new Set();let questions=0;
   for(let round=1;round<=4;round++)for(let i=0;i<count;i++){
    const index=(round-1)*count+i,visit=route[index]??{suspectId:c.suspects[index%c.suspects.length].id,topics:topics.slice(0,3)};
    await act(i,'select',{round,suspectId:visit.suspectId});
    for(const topic of visit.topics){const state=await act(i,'ask',{round,question:topic});questions++;const m=state.me.interviews.at(-1).messages.at(-1);ensure(m.status==='canonical'&&m.reply===c.suspects.find(s=>s.id===visit.suspectId).responses[topic]);for(const d of state.me.deductions)earned.add(d.id);ensure(!state.result);ensure(!('brief' in state.suspects[0]));}
   }
   ensure(c.deductions.filter(d=>d.key).every(d=>earned.has(d.id)));
   let end;for(let i=0;i<count;i++)end=await act(i,'vote',{suspectId:c.culpritId});ensure(end.result.outcome==='complete'&&end.result.culpritId===c.culpritId);
   ensure(questions===count*12);ensure((await store.getRoom(code)).caseVersion===c.version);sessions.push({players:count,turns:4,questions,correctReveal:true,allKeyDeductions:true});
  }
  reports.push({caseIndex:reports.length,preflight,aiContextsChecked:60,routeInterviews:route.length,missingWitnessRoutesPass:missingWitnessRoutes.every(r=>r&&r.length<=12),sessions});
 }
 return {ok:true,caseCount:reports.length,completeSessions:reports.length*2,paidCalls:0,reports,scope:'Offline authored-answer mechanics, privacy and context bounds; does not validate live AI quality or replace blind human playtests.'};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{console.log(JSON.stringify(await checkLibrary(await loadCase()),null,2));}catch{console.error('Private library check failed. Inspect the trusted local source privately; narrative and errors are suppressed.');process.exitCode=1;}}
