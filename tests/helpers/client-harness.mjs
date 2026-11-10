import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createUiState,uiContext,STAGES} from '../../public/ui-state.js';
export const appSource=await readFile(new URL('../../public/app.js',import.meta.url),'utf8');
export function clientHarness(initial) {
 const saved=new Map(),elements=new Map(),requests=[],historyCalls=[],announcements=[];
 const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 function element(id) { if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:'',dataset:{},className:'',disabled:false,open:false,focus(){this.focused=true;},showModal(){this.open=true;},close(){this.open=false;},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}});return elements.get(id); }
 const document={body:{classList:{toggle(){}}},activeElement:null,querySelector:selector=>element(selector.replace(/^#/,'')),getElementById:element,querySelectorAll:()=>[],addEventListener(){}};
 const sandbox={createUiState,uiContext,STAGES,document,sessionStorage:storage,localStorage:storage,
  location:{hash:'',pathname:'/',search:''},history:{pushState(...args){historyCalls.push(['push',...args]);},replaceState(...args){historyCalls.push(['replace',...args]);}},
  navigator:{clipboard:{writeText:async()=>{}}},crypto:{getRandomValues(bytes){bytes.fill(requests.length+1);return bytes;}},
  AbortSignal:{timeout(){}},setTimeout(){},clearTimeout(){},URL,URLSearchParams,structuredClone,console,
  fetch:async(path,options)=>{requests.push({path,body:options?.body?JSON.parse(options.body):null});return {ok:true,status:200,json:async()=>({...initial,version:initial.version+1})};},
 };
 const source=appSource.replace(/^import .*;\n/gm,'').split('// Browser events')[0].split("document.addEventListener(")[0];
 vm.runInNewContext(source+`;globalThis.client={navigate:typeof navigate==='function'?navigate:null,applyState:typeof applyState==='function'?applyState:null,openConfirmation:typeof openConfirmation==='function'?openConfirmation:null,confirmAction:typeof confirmAction==='function'?confirmAction:null,closeConfirmation:typeof closeConfirmation==='function'?closeConfirmation:null,trapDialogFocus:typeof trapDialogFocus==='function'?trapDialogFocus:null,render,runPending,command,publicSources:typeof publicSources==='function'?publicSources:null,renderNarration,resetSession:typeof resetSession==='function'?resetSession:null,read:()=>({state,stage,pending,busy,confirmation}),clearState:()=>{state=null;lastVersion=-1;},setState:value=>{state=value;session={code:value.code,playerId:value.me.id};lastVersion=value.version;stage='analyse';},ui:typeof ui!=='undefined'?ui:null};`,sandbox);
 assert.equal(typeof sandbox.client.navigate,'function','Three-stage navigation API exists');
 sandbox.client.setState(structuredClone(initial));
 return {client:sandbox.client,sandbox,elements,element,requests,historyCalls,saved,announcements};
}
export function clientState(overrides={}) {
 return {code:'ABCDEFGH',version:2,phase:'investigation',round:1,remainingHours:24,config:{rounds:3,maxQuestions:4},
  case:{id:'demo',title:'Synthetic test case',victim:'Fictional person',place:'Test carriage',method:'Test event',prediction:'Synthetic forecast'},
  suspects:[{id:'ben',name:'Ben Hargreaves',role:'Train Technician',initials:'BH',profile:'Synthetic public profile'},{id:'martha',name:'Martha Vale',role:'Operations Director',initials:'MV',profile:'Synthetic public profile'}],
  players:[{id:'p1',name:'Agent One',host:true,ready:false,selectedSuspectId:null,voteSubmitted:false},{id:'p2',name:'Agent Two',host:false,ready:false,selectedSuspectId:null,voteSubmitted:false},{id:'p3',name:'Agent Three',host:false,ready:false,selectedSuspectId:null,voteSubmitted:false}],
  me:{id:'p1',name:'Agent One',host:true,interviews:[],vote:null},board:[],...overrides};
}
