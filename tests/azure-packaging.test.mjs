import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// The deployment builder is explicit and cannot select a private case through environment.
test('Azure package builder pins public demo and does not read credentials or private source',async()=>{
 const source=await readFile(new URL('../scripts/package-azure.mjs',import.meta.url),'utf8');
 assert.match(source,/examples\/public-demo\.mjs/);assert.match(source,/includePath\(path\)/);
 assert.doesNotMatch(source,/process\.env|\.env\.local|SHIFT_CASE_FILE/);
 assert.match(source,/sourcemap:false/);assert.match(source,/THIRD_PARTY_LICENSES/);
});

test('packaged Azure maintenance server is runnable and refuses game access',async()=>{
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 await promisify(execFile)(process.execPath,['scripts/package-azure.mjs']);
 const {createBootstrapServer}=await import('../build/azure/server/azure-bootstrap.mjs');
 const server=createBootstrapServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const origin=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin+'/healthz')).status,200);
  for(const path of ['/','/api/cases','/private/case.json'])assert.equal((await fetch(origin+path)).status,503);
  const config=JSON.parse(await readFile(new URL('../build/azure/package.json',import.meta.url),'utf8'));
  assert.equal(config.scripts.start,'node server/azure-index.mjs');
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('explicit JSON library packages all cases, preserves raw hashes and never bundles private stories into web/server assets',async()=>{
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createHash}=await import('node:crypto');
 const {caseLibrary}=await import('./fixtures/case-library.mjs');const {readPinnedCase}=await import('../server/azure/runtime.mjs');const {validateCaseLibrary}=await import('../server/case-loader.mjs');const {PUBLIC_ASSETS}=await import('../server/public-assets.mjs');
 const dir=await mkdtemp(join(tmpdir(),'shift-library-package-'));const file=join(dir,'cases.json'),run=promisify(execFile);
 try{
  const input=structuredClone(caseLibrary);for(const c of input.cases)c.privateTestPadding='SYNTHETIC_PRIVATE_SENTINEL_'.repeat(1400);
  const bytes=JSON.stringify(input);assert.ok(Buffer.byteLength(bytes)>200000);await writeFile(file,bytes);
  await run(process.execPath,['scripts/package-azure.mjs','--case-bundle',file,'--release-commit','a'.repeat(40)]);
  const packed=await readFile(new URL('../build/azure/private/case.json',import.meta.url));assert.equal(packed.toString(),bytes);
  const manifest=JSON.parse(await readFile(new URL('../build/azure/case-manifest.json',import.meta.url),'utf8'));assert.equal(manifest.case,'private-library');assert.equal(manifest.sha256,createHash('sha256').update(packed).digest('hex'));
  const data=await readPinnedCase({caseFile:new URL('../build/azure/private/case.json',import.meta.url).pathname,caseHash:manifest.sha256});assert.equal(data.registry.current.size,6);assert.equal(data.caseData.version,validateCaseLibrary(input).caseData.version);
  for(const path of ['server/azure-index.mjs',...PUBLIC_ASSETS.map(a=>'public/'+a.file)])assert.ok(!(await readFile(new URL('../build/azure/'+path,import.meta.url))).includes(Buffer.from('SYNTHETIC_PRIVATE_SENTINEL_')),`Private marker in ${path}`);
  for(const args of [['--case-bundle'],['--case-bundle',file,'--case-bundle',file]])await assert.rejects(()=>run(process.execPath,['scripts/package-azure.mjs',...args]));
  await writeFile(file,'PRIVATE_MALFORMED_CONTENT');await assert.rejects(()=>run(process.execPath,['scripts/package-azure.mjs','--case-bundle',file]),e=>!e.stderr.includes('PRIVATE_MALFORMED_CONTENT')&&e.stderr.includes('Invalid case bundle'));
  await writeFile(file,'x'.repeat(2_000_001));await assert.rejects(()=>run(process.execPath,['scripts/package-azure.mjs','--case-bundle',file]),/size limit/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
