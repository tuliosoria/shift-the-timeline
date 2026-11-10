import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCase} from '../server/case-loader.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
import {checkCase} from '../scripts/check-case.mjs';
test('case preflight exercises all60 answers and3 outcomes without emitting private facts',()=>{
 const data=structuredClone(TRAIN_CASE);data.solution.motive='SECRET MOTIVE MUST NOT APPEAR';data.suspects[0].responses.clue='SECRET ANSWER MUST NOT APPEAR';const before=structuredClone(data);
 const result=checkCase(validateCase({caseData:data,catalog:CASES}));assert.equal(result.canonicalAnswersChecked,60);assert.equal(result.suspectsChecked,15);assert.deepEqual(result.outcomesChecked,['defeat','partial','complete']);assert.doesNotMatch(JSON.stringify(result),/SECRET|suspect-0|Fictional character/);assert.deepEqual(data,before);
});
test('case preflight reports duplicate text as a warning not invented solvability evidence',()=>{
 const data=structuredClone(TRAIN_CASE);data.suspects[1].responses.clue=data.suspects[0].responses.clue;const result=checkCase(validateCase({caseData:data,catalog:CASES}));assert.equal(result.repeatedAnswerCount,1);assert.equal(result.warnings.length,1);assert.match(result.scope,/not a proof/);
});
test('CLI defaults to no case and never exposes arbitrary module errors',()=>{
 const env={...process.env};delete env.SHIFT_CASE_FILE;const missing=spawnSync(process.execPath,['scripts/check-case.mjs'],{env,encoding:'utf8'});assert.equal(missing.status,1);assert.match(missing.stderr,/preflight failed/);
 const invalid=spawnSync(process.execPath,['scripts/check-case.mjs'],{env:{...env,SHIFT_CASE_FILE:'DO_NOT_ECHO_PRIVATE_PATH'},encoding:'utf8'});assert.equal(invalid.status,1);assert.ok(!invalid.stderr.includes('DO_NOT_ECHO_PRIVATE_PATH'));
});

test('CLI suppresses a thrown private module message and stack',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'shift-case-check-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'case.mjs');await writeFile(path,"throw new Error('PRIVATE_NARRATIVE_MARKER');\n");
 const result=spawnSync(process.execPath,['scripts/check-case.mjs'],{env:{...process.env,SHIFT_CASE_FILE:path},encoding:'utf8'});assert.equal(result.status,1);assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_NARRATIVE_MARKER|case\.mjs|at file:/);
});
