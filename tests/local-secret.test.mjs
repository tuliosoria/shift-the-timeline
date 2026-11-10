import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,chmod,symlink,rm,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createLocalSecretReader} from '../server/ai/local-secret.mjs';
async function fixture(run){const dir=await mkdtemp(path.join(await realpath(tmpdir()),'shift-secret-test-'));try{await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('local credential reader reads private file lazily, never changes environment',()=>fixture(async dir=>{const p=path.join(dir,'key'),before=process.env.OPENAI_API_KEY,read=createLocalSecretReader(p);await assert.rejects(read(),{message:'Local AI credential unavailable'});await writeFile(p,'OPENAI_API_KEY=sk-SYNTHETIC_ONLY\n',{mode:0o600});assert.equal(await read(),'sk-SYNTHETIC_ONLY');assert.equal(process.env.OPENAI_API_KEY,before);}));
test('local reader rejects public permissions and malformed credentials with generic error',()=>fixture(async dir=>{const p=path.join(dir,'key');await writeFile(p,'OPENAI_API_KEY=sk-SYNTHETIC_ONLY',{mode:0o644});await chmod(p,0o644);await assert.rejects(createLocalSecretReader(p)(),{message:'Local AI credential unavailable'});await chmod(p,0o600);await writeFile(p,'PRIVATE_INVALID_CONTENT');await assert.rejects(createLocalSecretReader(p)(),{message:'Local AI credential unavailable'});}));
test('local reader rejects symlink and relative path',()=>fixture(async dir=>{assert.throws(()=>createLocalSecretReader('.env.local'));const p=path.join(dir,'key'),link=path.join(dir,'link');await writeFile(p,'OPENAI_API_KEY=sk-SYNTHETIC_ONLY',{mode:0o600});await symlink(p,link);await assert.rejects(createLocalSecretReader(link)(),{message:'Local AI credential unavailable'});}));

test('local reader rejects parent symlinks and symlink-dotdot path confusion',()=>fixture(async dir=>{
 const approved=path.join(dir,'approved'),redirect=path.join(dir,'redirect');await mkdir(approved);await mkdir(redirect);await mkdir(path.join(redirect,'sub'));
 await writeFile(path.join(approved,'key'),'OPENAI_API_KEY=sk-APPROVED_SYNTHETIC',{mode:0o600});await writeFile(path.join(redirect,'key'),'OPENAI_API_KEY=sk-REDIRECT_SYNTHETIC',{mode:0o600});
 await symlink(path.join(redirect,'sub'),path.join(approved,'link'));
 assert.throws(()=>createLocalSecretReader(approved+'/link/../key'),/Absolute local credential path required/);
 await symlink(redirect,path.join(dir,'parent-link'));
 await assert.rejects(createLocalSecretReader(path.join(dir,'parent-link','key'))(),{message:'Local AI credential unavailable'});
}));
