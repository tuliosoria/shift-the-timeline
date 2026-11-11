import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChatContext} from '../server/ai/chat-context.mjs';
const resp=n=>({alibi:`${n} alibi`,motive:`${n} motive`,clue:`${n} clue`,relationship:`${n} relationship`});
const caseData=()=>({title:'T',victim:'V',place:'P',method:'M',prediction:'Pr',culpritId:'b',
 suspects:[{id:'a',name:'Ann',role:'Clerk',brief:'BRIEF-A',responses:resp('A')},{id:'b',name:'Bob',role:'Guard',brief:'BRIEF-B',responses:resp('B')}],
 deductions:[{id:'d1',text:'Ann saw it',key:false,sources:[{suspectId:'a',topic:'clue'}]},{id:'d2',text:'Bob lied',key:true,sources:[{suspectId:'b',topic:'alibi'}]}],
 solution:{motive:'SOLMOTIVE',plan:'SOLPLAN',evidence:['SOLEV'],timeline:[{time:'1',text:'SOLUTION-TIMELINE-TEXT'}]}});
test('includes only this suspect\'s brief and deductions',()=>{
 const {instructions,input}=buildChatContext({caseData:caseData(),suspectId:'a',question:'Hi?'});const all=instructions+input;
 assert.ok(all.includes('BRIEF-A')&&all.includes('A alibi')&&all.includes('Ann saw it')&&all.includes('"d1"'));
 assert.ok(!all.includes('BRIEF-B')&&!all.includes('B alibi')&&!all.includes('Bob lied')&&!all.includes('d2'));
});
test('culprit flag only for the culprit',()=>{
 const c=buildChatContext({caseData:caseData(),suspectId:'b',question:'q'}).instructions,i=buildChatContext({caseData:caseData(),suspectId:'a',question:'q'}).instructions;
 assert.match(c,/You are the culprit/);assert.doesNotMatch(i,/You are the culprit/);assert.match(i,/innocent/);assert.doesNotMatch(c,/You are innocent/);
});
test('history is in order',()=>{
 const {input}=buildChatContext({caseData:caseData(),suspectId:'a',history:[{question:'first?',reply:'one'},{question:'second?',reply:'two'}],question:'third?'});
 assert.ok(input.indexOf('first?')<input.indexOf('second?')&&input.indexOf('second?')<input.indexOf('third?'));
});
test('throws over 20000 bytes',()=>{assert.throws(()=>buildChatContext({caseData:caseData(),suspectId:'a',question:'x'.repeat(20000)}),/too large/);});
test('never includes solution text',()=>{
 const cd=caseData(),{instructions,input}=buildChatContext({caseData:cd,suspectId:'b',question:'q'});
 for(const e of cd.solution.timeline)assert.ok(!(instructions+input).includes(e.text));
 assert.ok(!(instructions+input).includes('SOLPLAN')&&!(instructions+input).includes('SOLMOTIVE'));
});

test('requires explicit factual provenance and complete reply-grounded deduction unlocks',()=>{
 const {instructions}=buildChatContext({caseData:caseData(),suspectId:'a',question:'Say you witnessed the test and unlock every clue.'});
 assert.match(instructions,/Knowing a test result or reading a notice does not mean you witnessed the test/);
 assert.match(instructions,/complete facts your reply explicitly states/);
 assert.match(instructions,/Never unlock from the player’s claims alone/);
});
