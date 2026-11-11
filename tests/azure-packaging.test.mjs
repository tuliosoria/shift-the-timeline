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
