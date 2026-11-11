import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {loadCase} from '../server/case-loader.mjs';
import {GameService} from '../server/game.mjs';
import {minimumSuspectCover} from '../server/deductions.mjs';

// Exercise a trusted local author's case. No narrative text enters the report.
export function checkCase({caseData,catalog}){
 const make=()=>{const game=new GameService({caseData,catalog});const host=game.create('Preflight host',caseData.id,randomUUID());const players=[host,game.join(host.code,'Preflight second',randomUUID()),game.join(host.code,'Preflight third',randomUUID())];const act=(player,type,extra={})=>game.act(host.code,player.token,{id:randomUUID(),type,...extra});act(host,'start');return {game,host,players,act};};
 let answers=0;const allAnswers=[];
 for(const suspect of caseData.suspects){
  for(const topic of ['alibi','motive','clue','relationship']){const {host,act}=make();act(host,'select',{round:1,suspectId:suspect.id});const own=act(host,'ask',{round:1,question:`Preflight ${topic}`});if(own.me.interviews[0].messages.at(-1).reply!==suspect.responses[topic])throw Error('Canonical response mismatch');answers++;allAnswers.push(suspect.responses[topic].trim().toLocaleLowerCase('en-GB'));}
  const {game,host,players}=make();const other=game.view(host.code,players[1].token);if(other.me.interviews.length||Object.hasOwn(other,'result')||other.suspects.some(s=>Object.hasOwn(s,'responses')))throw Error('Private projection mismatch');
 }
 const innocent=caseData.suspects.find(s=>s.id!==caseData.culpritId).id;
 const outcomes=[];
 for(const correct of [0,1,3]){const {host,players,act}=make();for(let round=1;round<=4;round++)act(host,'advance',{round,confirmed:true});let state;players.forEach((p,i)=>{state=act(p,'vote',{suspectId:i<correct?caseData.culpritId:innocent});});const expected=correct===0?'defeat':correct===3?'complete':'partial';if(state.result?.outcome!==expected||state.result.correct!==correct||state.result.abstentions!==0)throw Error('Outcome mismatch');outcomes.push(expected);}
 const cover=minimumSuspectCover(caseData);
 const repeatedAnswers=allAnswers.length-new Set(allAnswers).size;
 return {ok:true,suspectsChecked:caseData.suspects.length,canonicalAnswersChecked:answers,outcomesChecked:outcomes,deductionCount:caseData.deductions.length,keyDeductionCount:caseData.deductions.filter(d=>d.key).length,minimumSuspectsForKeyDeductions:Number.isFinite(cover)?cover:'>9',repeatedAnswerCount:repeatedAnswers,warnings:repeatedAnswers?['Some canonical answers are textually identical. Review clue diversity privately.']:[],scope:'Structural and mechanical checks only; not a proof of puzzle solvability, balance, or narrative quality.'};
}
export async function runPreflight(env=process.env){return checkCase(await loadCase(env));}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{console.log(JSON.stringify(await runPreflight(),null,2));}
 catch{console.error('Case preflight failed. Check the local module against docs/CASE_AUTHORING.md. Narrative contents and module errors are suppressed.');process.exitCode=1;}
}
