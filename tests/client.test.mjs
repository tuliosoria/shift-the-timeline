import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
test('busy-state reset preserves buttons locked by game rules',()=>{
 const locked={disabled:true,dataset:{locked:'true'}},available={disabled:false,dataset:{}};
 const sandbox={document:{body:{classList:{toggle(){}}},querySelectorAll(){return [locked,available];}},busy:false,pending:null};
 vm.runInNewContext(source.match(/function setBusy\(\)\{[^\n]+\}/)[0]+';setBusy();',sandbox);
 assert.equal(locked.disabled,true);assert.equal(available.disabled,false);
 sandbox.busy=true;vm.runInNewContext('setBusy()',sandbox);assert.equal(available.disabled,true);
 sandbox.busy=false;sandbox.pending={};vm.runInNewContext('setBusy()',sandbox);assert.equal(available.disabled,true);
});
test('user text escapes all HTML control characters',()=>{
 const line=source.split('\n').find(line=>line.startsWith('const esc='));
 const sandbox={};vm.runInNewContext(line+'; result=esc(\'<script x="1">&hello</script>\');',sandbox);
 assert.equal(sandbox.result,'&lt;script x=&quot;1&quot;&gt;&amp;hello&lt;/script&gt;');
});
test('request IDs work over HTTP LAN without crypto.randomUUID',()=>{
 const sandbox={crypto:{getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=i+1;return bytes;}}};
 const implementation=source.match(/function newRequestId\(\)\{[^\n]+\}/)?.[0];
 assert.ok(implementation,'HTTP-compatible request ID generator must exist');
 vm.runInNewContext(implementation+'; result=newRequestId();',sandbox);
 assert.equal(sandbox.result,'0102030405060708090a0b0c0d0e0f10');
 assert.ok(!source.includes('crypto.randomUUID('));
});
test('a late poll cannot roll back confirmed actions or replace a different room',async()=>{
 let resolve;const notice={dataset:{}};
 const sandbox={session:{code:'ABC123',token:'token-a'},state:{version:5,phase:'investigation'},lastVersion:5,busy:false,pending:null,fetchJson:()=>new Promise(r=>resolve=r),render(){},$:()=>notice};
 vm.runInNewContext(source.match(/async function poll\(\)\{[^\n]+\}/)[0]+'; result=poll();',sandbox);
 sandbox.state={version:6,phase:'accusation'};sandbox.lastVersion=6;
 resolve({version:5,phase:'investigation',round:1});await sandbox.result;
 assert.equal(sandbox.state.version,6);assert.equal(sandbox.lastVersion,6);
 vm.runInNewContext('result=poll()',sandbox);
 sandbox.session={code:'DEF456',token:'token-b'};sandbox.state={version:1,phase:'lobby'};sandbox.lastVersion=1;
 resolve({version:99,phase:'reveal'});await sandbox.result;
 assert.equal(sandbox.state.version,1);assert.equal(sandbox.lastVersion,1);
});
test('rejected question and note submissions keep the unsent draft',async()=>{
 for(const [formId,fieldName,selector] of [['question-form','question','#question'],['note-form','text','#note']]){
  const field={value:'Draft that was not sent'};let handler;
  const sandbox={document:{addEventListener(event,fn){handler=fn;}},busy:false,pending:null,state:{round:1},act:async()=>false,$:()=>field,FormData:class{*[Symbol.iterator](){yield [fieldName,field.value];}},Object};
  vm.runInNewContext(source.split('\n').find(line=>line.startsWith("document.addEventListener('submit'")),sandbox);
  await handler({preventDefault(){},target:{id:formId}});
  assert.equal(field.value,'Draft that was not sent',selector);
 }
});
test('confirmed commands clear only their own matching drafts; failures preserve text',async()=>{
 const fn=source.slice(source.indexOf('async function runPending'),source.indexOf('function setBusy'));
 for(const [type,draft,sent,fail,expected] of [['start','','',false,''],['ask','Hello','Hello',false,''],['ask','Changed draft','Hello',false,'Changed draft'],['note','Keep me','Keep me',true,'Keep me']]){
  const field={value:draft},banner={textContent:''};
  const sandbox={pending:{path:'/api/test',body:{type,...(type==='ask'?{question:sent}:type==='note'?{text:sent}:{})}},busy:false,session:{token:'test'},storage:{remove(){}},setBusy(){},render(){},notice(){},$:selector=>selector==='#notice'?banner:field,fetchJson:async()=>{if(fail){const e=new Error('Rate limit');e.status=429;throw e;}return {version:2};}};
  vm.runInNewContext(fn+'; result=runPending()',sandbox);
  assert.equal(await sandbox.result,!fail,type);assert.equal(field.value,expected,type);
 }
});
test('browser uses cookie credentials and eight-character invitations without JavaScript bearer tokens',()=>{assert.ok(!source.includes('Authorization:'));assert.ok(!source.includes('token:p'));assert.match(source,/credentials:'same-origin'/);assert.match(source,/minlength="8" maxlength="8"/);assert.match(source,/api\/session/);});
test('generated narration is labelled separately and escaped without changing the canonical answer',()=>{const fn=source.match(/function renderNarration\(message\)\{[^\n]+\}/)?.[0];assert.ok(fn,'Separate narration renderer required');const sandbox={};vm.runInNewContext(source.split('\n').find(x=>x.startsWith('const esc='))+fn+'; result=renderNarration({answer:"CANON",narration:{status:"complete",text:"<script>bad</script>"}});',sandbox);assert.match(sandbox.result,/NÃO É EVIDÊNCIA/);assert.ok(!sandbox.result.includes('<script>'));assert.match(sandbox.result,/&lt;script&gt;/);assert.ok(!sandbox.result.includes('CANON'));vm.runInNewContext('result=renderNarration({narration:{status:"pending"}})',sandbox);assert.equal(sandbox.result,'');});
test('repeated retry clicks share one in-flight attempt and cannot unlock a stale response',async()=>{
 const fn=source.slice(source.indexOf('async function runPending'),source.indexOf('function setBusy'));
 const responses=[];const work={path:'/api/test',body:{type:'start',id:'same-request'}};
 const sandbox={pending:work,busy:false,storage:{remove(){}},setBusy(){},render(){},notice(){},$:()=>({textContent:''}),fetchJson:()=>new Promise(resolve=>responses.push(resolve))};
 vm.runInNewContext(fn+'; first=runPending(); second=runPending()',sandbox);
 const started=responses.length;for(const resolve of responses)resolve({version:2});
 assert.equal(await sandbox.first,true);assert.equal(await sandbox.second,false);
 assert.equal(started,1);assert.equal(sandbox.busy,false);assert.equal(sandbox.pending,null);
});
test('a different command cannot replace an uncertain pending request',async()=>{
 const fn=source.slice(source.indexOf('async function command'),source.indexOf('async function runPending'));
 const work={path:'/api/test',body:{type:'ask',id:'original-request'}};let starts=0;
 const sandbox={pending:work,busy:false,storage:{set(){}},setBusy(){},runPending:async()=>{starts++;return true;}};
 vm.runInNewContext(fn+"; result=command('/api/other',{type:'note',id:'different-request'})",sandbox);
 assert.equal(await sandbox.result,false);assert.equal(starts,0);assert.equal(sandbox.pending,work);
});
test('initial command starts exactly once and the same request can be retried after transport failure',async()=>{
 const fn=source.slice(source.indexOf('async function command'),source.indexOf('function setBusy'));
 const requests=[],body={type:'ask',id:'stable-id',question:'Keep until confirmed'};
 const sandbox={pending:null,busy:false,storage:{set(){},remove(){}},setBusy(){},render(){},notice(){},$:()=>({textContent:'',value:''}),fetchJson:async(path,options)=>{requests.push({path,body:options.body});if(requests.length===1)throw new Error('offline');return {version:3};},body};
 vm.runInNewContext(fn+"; first=command('/api/test',body)",sandbox);
 assert.equal(await sandbox.first,false);assert.equal(sandbox.pending.body,body);assert.equal(sandbox.busy,false);
 vm.runInNewContext('second=runPending()',sandbox);assert.equal(await sandbox.second,true);
 assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);assert.equal(sandbox.pending,null);assert.equal(sandbox.state.version,3);
});
