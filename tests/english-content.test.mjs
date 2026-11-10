import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {GameService} from '../server/game.mjs';
import {createProvider} from '../server/ai/provider.mjs';
import {TRAIN_CASE, CASES} from './fixtures/case.mjs';
function questionTopic(question) {
  const game=new GameService({caseData:TRAIN_CASE,catalog:CASES}),host=game.create('Host','demo',randomUUID());
  game.join(host.code,'Second',randomUUID()); game.join(host.code,'Third',randomUUID());
  const act=(type,data={})=>game.act(host.code,host.token,{id:randomUUID(),type,...data});
  act('start');act('select',{round:1,suspectId:'suspect-1'});
  return act('ask',{round:1,question}).me.interviews[0].messages[0].topic;
}
for(const [question,topic] of [
 ['Where were you at 22:00?','alibi'],['When did you leave?','alibi'],['What time did you arrive?','alibi'],
 ['Did money or debt give you a motive?','motive'],['What would you gain or lose?','motive'],['Why were you hiding that secret?','motive'],
 ['How did you know the victim?','relationship'],['What was your relationship with him?','relationship'],
 ['I wonder what your motive was.','motive'],['I wondered how you knew the victim.','relationship'],
 ['That wonderful clue seems unusual.','clue'],['Onde estava?','alibi'],['Como conhece essa pessoa?','relationship'],
 ['What did you notice?','clue'],['Onde você estava ontem?','alibi'],['Você tinha alguma dívida?','motive'],['Como conhecia a vítima?','relationship'],
]) test(`free question selects canonical topic ${topic}: ${question}`,()=>assert.equal(questionTopic(question),topic));
test('public development case is fully English while keeping synthetic IDs and topic keys',()=>{
 assert.equal(TRAIN_CASE.id,'demo'); assert.equal(TRAIN_CASE.title,'Development test case');
 assert.equal(TRAIN_CASE.suspects.length,15);assert.equal(TRAIN_CASE.suspects[0].name,'Character 0');
 assert.ok(CASES.every(c=>!/[ãõçáéíóú]/i.test(JSON.stringify(c))));
 for(const suspect of TRAIN_CASE.suspects){assert.deepEqual(Object.keys(suspect.responses).sort(),['alibi','clue','motive','relationship']);assert.match(suspect.opening,/synthetic/i);}
 assert.match(TRAIN_CASE.solution.plan,/synthetic/i);
});
test('user-facing backend rejection text is English without changing status codes',()=>{
 const game=new GameService({caseData:TRAIN_CASE,catalog:CASES});
 assert.throws(()=>game.create('', 'demo',randomUUID()),e=>e.status===400&&e.message==='Name: enter between 1 and 24 characters.');
 const host=game.create('Host','demo',randomUUID());
 assert.throws(()=>game.view(host.code,'wrong'),e=>e.status===401&&e.message==='Your session is not valid for this room.');
 assert.throws(()=>game.act(host.code,host.token,{id:randomUUID(),type:'start'}),e=>e.status===400&&e.message==='At least 3 players are required.');
});
test('inactive provider requests British English and keeps its original safety boundaries',async()=>{
 let payload;
 const provider=createProvider({model:'synthetic-model',getSecret:async()=> 'synthetic-key',fetchImpl:async(_url,options)=>{
  payload=JSON.parse(options.body);
  return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({voice:'A fictional line.'})}]}],usage:{input_tokens:10,output_tokens:5}}));
 }});
 await provider({persona:'Fictional character',canonical:'Synthetic fact',question:'What did you notice?'});
 assert.match(payload.input[0].content,/British English/);assert.ok(!payload.input[0].content.includes('Portuguese'));
 assert.match(payload.input[0].content,/Do not add facts/);assert.equal(payload.store,false);assert.equal(payload.max_output_tokens,350);assert.equal(payload.tools,undefined);
});
test('backend transport, session and limiter messages contain no previous Portuguese copy',async()=>{
 for(const file of ['api','sessions','limits','origin','runtime','lambda','persistent-game']){
  const source=await readFile(new URL(`../server/${file}.mjs`,import.meta.url),'utf8');
  assert.ok(!/Sessão|sessão|Identificador|Código|encontrada|indisponível|inválid|permitid|temporári|atingido|Requisição|Método|ações|dados|necessária|Use JSON|Muitas|Tente|Objeto|JSON inválido|Novas salas/.test(source),file);
 }
});
