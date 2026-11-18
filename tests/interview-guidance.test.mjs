import test from 'node:test';
import assert from 'node:assert/strict';
import {renderChatFooter,renderWaiting,renderBriefing} from '../public/views.js';
import {setLocale} from '../public/i18n.js';
import {createDocument} from './helpers/fake-dom.mjs';

for(const locale of ['en-GB','pt-BR'])test(`interview guidance explains drafts, completion and sources in ${locale}`,()=>{
 setLocale(locale);
 try{
  const interview={round:1,suspectId:'witness',opening:'Stored opening',messages:[],closed:false};
  const state={phase:'investigation',round:1,clock:{time:'12:00',crimeAt:'18:00'},config:{rounds:4,maxQuestions:3,hoursPerRound:6},case:{victim:'Alex',prediction:'A future risk'},suspects:[{id:'witness',name:'Sam'}],players:[{id:'owner',ready:false},{id:'peer',name:'Pat',ready:false}],me:{id:'owner',interviews:[interview],deductions:[],host:false}};
  const footer=createDocument(renderChatFooter(state,{}));
  assert.match(footer.querySelector('.suggestion-hint').textContent,locale==='pt-BR'?/opcionais.*não são enviadas/i:/optional.*not sent/i);
  assert.equal(footer.querySelectorAll('[data-chip]').length,4);
  assert.equal(footer.querySelectorAll('[data-action]').length,0,'copy adds no gameplay action');
  interview.messages=Array.from({length:3},(_,i)=>({id:String(i),status:'canonical',question:'q',reply:'r'}));interview.closed=true;
  const done=createDocument(renderChatFooter(state,{}));
  assert.match(done.body.textContent,locale==='pt-BR'?/Continuar.*não envia/i:/Continue.*does not send/i);
  assert.equal(done.querySelector('button').dataset.action,'leave-chat');
  assert.equal(done.querySelector('textarea'),null,'no fourth-question composer');
  const waiting=createDocument(renderWaiting(state,{})).body.textContent;
  assert.match(waiting,locale==='pt-BR'?/quem disse.*hipóteses/i:/who said.*hypotheses/i);
  assert.match(waiting,locale==='pt-BR'?/automaticamente/i:/automatically/i);
  const briefing=createDocument(renderBriefing(state,{})).body.textContent;
  assert.match(briefing,locale==='pt-BR'?/quem disse.*hipóteses/i:/who said.*hypotheses/i);
 }finally{setLocale('en-GB');}
});
