import test from 'node:test';
import assert from 'node:assert/strict';
import {t,setLocale,getLocale,readLocale,saveLocale} from '../public/i18n.js';
import {getTopicLabels,questionTopic} from '../public/question-topics.js';
import {renderLanding} from '../public/views.js';
test('English defaults and authored Portuguese UI never rewrites player text',()=>{
 setLocale('en-GB');assert.equal(getLocale(),'en-GB');assert.equal(t('New room'),'New room');
 setLocale('pt-BR');assert.equal(t('New room'),'Nova sala');
 const html=renderLanding(null,{entry:'create',cases:[{available:true,id:'x',title:'New room'},{available:true,id:'y',title:'Other'}]});
 assert.match(html,/Nova sala/);assert.match(html,/>New room<\/option>/);
 assert.equal(questionTopic(getTopicLabels('pt-BR').motive),'motive');
 assert.equal(questionTopic('O que você percebeu?'),'clue');
 assert.equal(questionTopic('Onde você estava durante os preparativos?'),'alibi');
 assert.equal(questionTopic('Você teve desentendimentos recentemente?'),'motive');
 assert.equal(questionTopic('Você conhece a pessoa em risco?'),'relationship');
 setLocale('en-GB');
});

test('locale storage is explicit and failure tolerant',()=>{
 const data=new Map(), storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.equal(readLocale(storage),'en-GB');saveLocale(storage,'pt-BR');assert.equal(readLocale(storage),'pt-BR');
 assert.equal(readLocale({getItem:()=> 'es'}),'en-GB');
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(readLocale(blocked),'en-GB');assert.equal(saveLocale(blocked,'pt-BR'),false);assert.equal(getLocale(),'pt-BR');
 setLocale('en-GB');
});

test('rate-limit and preference field errors have authored Portuguese messages',()=>{
 setLocale('pt-BR');
 assert.equal(t('Temporary limit reached. Please try again later.'),'Limite temporário atingido. Tente novamente mais tarde.');
 assert.equal(t('Unexpected language preference field.'),'Campo inesperado na preferência de idioma.');
 setLocale('en-GB');
});
