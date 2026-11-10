import test from 'node:test';
import assert from 'node:assert/strict';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
const impl=await import('../server/case-loader.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('case loader requires an explicit private source',async()=>{assert.equal(typeof impl.loadCase,'function');await assert.rejects(()=>impl.loadCase({}),/SHIFT_CASE_FILE/);});
test('case schema rejects invalid IDs, oversized canon and missing solution',()=>{assert.equal(typeof impl.validateCase,'function');assert.equal(impl.validateCase({caseData:TRAIN_CASE,catalog:CASES}).caseData.id,'demo');assert.throws(()=>impl.validateCase({caseData:{...TRAIN_CASE,culpritId:'absent'},catalog:CASES}),/culprit/);assert.throws(()=>impl.validateCase({caseData:{...TRAIN_CASE,suspects:TRAIN_CASE.suspects.slice(1)},catalog:CASES}),/15/);});
test('case identity changes when canonical content changes even if an author reuses a label',()=>{assert.equal(typeof impl.validateCase,'function');const first=impl.validateCase({caseData:TRAIN_CASE,catalog:CASES});const changed=impl.validateCase({caseData:{...TRAIN_CASE,prediction:'Changed canonical future'},catalog:CASES});assert.notEqual(first.caseData.version,changed.caseData.version);});
