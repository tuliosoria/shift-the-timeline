import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {translatedLibrary,translationFor} from './fixtures/localised-case.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
import {validateCaseLibrary,loadCase} from '../server/case-loader.mjs';
const execute=promisify(execFile);
const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(moduleValues,run){
 const dir=await mkdtemp(join(tmpdir(),'shift-language-export-'));
 try{
  const source=join(dir,'source.mjs'),output=join(dir,'export');
  await writeFile(source,Object.entries(moduleValues).map(([name,value])=>`export const ${name}=${JSON.stringify(value)};`).join('\n'));
  await run({source,output,exportModule:()=>execute(process.execPath,['scripts/export-case-library.mjs',source,output])});
 }finally{await rm(dir,{recursive:true,force:true});}
}
async function readExport(output){return{bytes:await readFile(join(output,'case-library.json')),manifest:JSON.parse(await readFile(join(output,'manifest.json'),'utf8'))};}
test('private exporter preserves raw library sidecars and records hashes without re-versioning English',async()=>{
 const expected=translatedLibrary();
 await fixture({caseLibrary:expected,translations:null},async({exportModule,output})=>{
  await exportModule();const{bytes,manifest}=await readExport(output),raw=JSON.parse(bytes);
  assert.equal(bytes.toString(),JSON.stringify(expected),'caseLibrary precedence and raw bytes are unchanged');
  assert.equal(manifest.sha256,digest(bytes));assert.equal(manifest.translationPins.length,1);
  assert.equal(manifest.translationPins[0].caseVersion,raw.translations[0].caseVersion);
  assert.equal(manifest.translationPins[0].sha256,digest(JSON.stringify(raw.translations[0])));
  assert.equal(raw.cases[0].version,'fixture-v1');
 });
});
for(const [caseName,catalogName]of[['caseData','catalog'],['TRAIN_CASE','CASES']]){
 const moduleBase={[caseName]:TRAIN_CASE,[catalogName]:CASES};
 test(`single-case ${caseName}/${catalogName} export preserves translations and canonical pins`,async()=>{
  const translations=[translationFor()],expected={caseData:TRAIN_CASE,catalog:CASES,translations};
  await fixture({...moduleBase,translations},async({source,exportModule,output})=>{
   const loaded=await loadCase({SHIFT_CASE_FILE:source});await exportModule();const{bytes,manifest}=await readExport(output),raw=JSON.parse(bytes);
   assert.equal(bytes.toString(),JSON.stringify(expected));assert.deepEqual(raw.translations,translations);
   assert.equal(manifest.sha256,digest(bytes));assert.equal(manifest.bytes,bytes.length);
   assert.equal(manifest.casePins[0].version,loaded.caseData.version);
   assert.equal(validateCaseLibrary(raw).caseData.version,loaded.caseData.version);
   assert.equal(raw.caseData.version,TRAIN_CASE.version);
   assert.deepEqual(manifest.translationPins,[{caseId:translations[0].caseId,caseVersion:translations[0].caseVersion,locale:'pt-BR',sha256:digest(JSON.stringify(translations[0]))}]);
  });
 });
 test(`single-case ${caseName}/${catalogName} without translations preserves legacy JSON bytes`,async()=>{
  await fixture(moduleBase,async({exportModule,output})=>{
   await exportModule();const{bytes,manifest}=await readExport(output);
   assert.equal(bytes.toString(),JSON.stringify({caseData:TRAIN_CASE,catalog:CASES}));assert.equal(manifest.sha256,digest(bytes));
   assert.deepEqual(manifest.translationPins,[]);assert.equal(Object.hasOwn(JSON.parse(bytes),'translations'),false);
  });
 });
 test(`single-case ${caseName}/${catalogName} rejects invalid translations without writing or exposing them`,async()=>{
  const stale=translationFor();stale.caseVersion='PRIVATE_SENTINEL_STALE_PIN';
  for(const translations of [null,[stale]])await fixture({...moduleBase,translations},async({exportModule,output})=>{
   await assert.rejects(exportModule(),error=>{assert.equal(error.code,1);assert.equal(error.stdout,'');assert.equal(error.stderr.trim(),'Private export failed. Review the trusted source and output path locally; module errors are suppressed.');return true;});
   await assert.rejects(access(output));
  });
 });
}
