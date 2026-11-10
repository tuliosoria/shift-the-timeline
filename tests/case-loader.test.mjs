import test from 'node:test';
import assert from 'node:assert/strict';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
const impl=await import('../server/case-loader.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('case loader requires an explicit private source',async()=>{assert.equal(typeof impl.loadCase,'function');await assert.rejects(()=>impl.loadCase({}),/SHIFT_CASE_FILE/);});
test('case schema rejects invalid IDs, oversized canon and missing solution',()=>{assert.equal(typeof impl.validateCase,'function');assert.equal(impl.validateCase({caseData:TRAIN_CASE,catalog:CASES}).caseData.id,'demo');assert.throws(()=>impl.validateCase({caseData:{...TRAIN_CASE,culpritId:'absent'},catalog:CASES}),/culprit/);assert.throws(()=>impl.validateCase({caseData:{...TRAIN_CASE,suspects:TRAIN_CASE.suspects.slice(1)},catalog:CASES}),/15/);});
test('case identity changes when canonical content changes even if an author reuses a label',()=>{assert.equal(typeof impl.validateCase,'function');const first=impl.validateCase({caseData:TRAIN_CASE,catalog:CASES});const changed=impl.validateCase({caseData:{...TRAIN_CASE,prediction:'Changed canonical future'},catalog:CASES});assert.notEqual(first.caseData.version,changed.caseData.version);});

const baseline=()=>({caseData:structuredClone(TRAIN_CASE),catalog:structuredClone(CASES)});
function rejectChange(path,value){
 const input=baseline(),parts=path.replace(/\[(\d+)\]/g,'.$1').split('.');
 let target=input;for(const key of parts.slice(0,-1))target=target[key];target[parts.at(-1)]=value;
 assert.throws(()=>impl.validateCase(input),error=>error instanceof impl.CaseValidationError&&error.message.startsWith(`${path}:`));
}
test('required case and reveal strings are nonblank and byte-bounded',()=>{
 for(const path of ['caseData.title','caseData.victim','caseData.place','caseData.method','caseData.prediction','caseData.solution.motive','caseData.solution.plan','caseData.suspects[0].name','caseData.suspects[0].responses.clue']){
  for(const value of [undefined,null,[],{},12,'',' \n\t ','é'.repeat(2501)])rejectChange(path,value);
 }
});
test('solution arrays and timeline records are structurally checked, including sparse slots',()=>{
 for(const path of ['caseData.solution.evidence','caseData.solution.timeline'])for(const value of [undefined,null,{},'not an array'])rejectChange(path,value);
 for(const value of [null,{},'',3,' '.repeat(5)])rejectChange('caseData.solution.evidence[0]',value);
 for(const value of [null,[],42])rejectChange('caseData.solution.timeline[0]',value);
 for(const path of ['caseData.solution.timeline[0].time','caseData.solution.timeline[0].text'])for(const value of [undefined,'',null,{}])rejectChange(path,value);
 const input=baseline();delete input.caseData.solution.evidence[0];assert.throws(()=>impl.validateCase(input),/caseData.solution.evidence\[0\]/);
});
test('suspects and culprit require safe unique string identifiers',()=>{
 for(const path of ['caseData.id','caseData.suspects[0].id','caseData.culpritId','catalog[0].id'])for(const value of [null,2,{},'A','../secret','a b','a'.repeat(41),''])rejectChange(path,value);
 rejectChange('caseData.suspects[1].id',TRAIN_CASE.suspects[0].id);
 rejectChange('caseData.culpritId','missing');
 rejectChange('caseData.suspects[0]',null);
 rejectChange('caseData.suspects[0].responses',[]);
});
test('catalog requires public identity and boolean availability without private or unknown fields',()=>{
 for(const value of [undefined,null,{},'catalog'])rejectChange('catalog',value);
 rejectChange('catalog[0]',null);
 for(const value of [undefined,'',{},' '.repeat(3)])rejectChange('catalog[0].title',value);
 for(const value of [undefined,1,'true',null])rejectChange('catalog[0].available',value);
 for(const path of ['catalog[0].location','catalog[0].description'])for(const value of [null,{},'', 'x'.repeat(5001)])rejectChange(path,value);
 const input=baseline();input.catalog.push({...input.catalog[0]});assert.throws(()=>impl.validateCase(input),/catalog\[1\].id/);
 for(const key of ['solution','culpritId','suspects','SECRET_UNKNOWN_KEY']){
  const input=baseline();input.catalog[0][key]='SECRET_PRIVATE_VALUE';
  assert.throws(()=>impl.validateCase(input),error=>error instanceof impl.CaseValidationError&&error.message==='catalog[0]: contains an unsupported public field');
 }
 rejectChange('catalog',[]);
 const unavailable=baseline();unavailable.catalog[0].available=false;assert.throws(()=>impl.validateCase(unavailable),/catalog: expected an available entry/);
});
test('optional versions, absent presentation fields and existing editorial extras remain compatible',()=>{
 const input=baseline();delete input.caseData.version;delete input.catalog[0].location;delete input.catalog[0].description;
 input.caseData.solution.evidence=[];input.caseData.solution.timeline=[];
 const result=impl.validateCase(input);assert.match(result.caseData.version,/^v1:[a-f0-9]{64}$/);
 assert.deepEqual(result.caseData.suspects[0].topics,TRAIN_CASE.suspects[0].topics);
 for(const value of [null,{},[],3,'','  ','x'.repeat(5001)])rejectChange('caseData.version',value);
});
test('validation diagnostics never expose private content, including serialization failures',()=>{
 const input=baseline();input.caseData.solution.plan={secret:'DO_NOT_PRINT'};
 assert.throws(()=>impl.validateCase(input),error=>error instanceof impl.CaseValidationError&&!error.message.includes('DO_NOT_PRINT'));
 const cyclic=baseline();cyclic.caseData.extra=cyclic.caseData;
 assert.throws(()=>impl.validateCase(cyclic),error=>error instanceof impl.CaseValidationError&&error.message==='caseData: expected JSON-serializable content');
 const huge=baseline();huge.caseData.extra='x'.repeat(150_001);assert.throws(()=>impl.validateCase(huge),/caseData: content exceeds/);
});
