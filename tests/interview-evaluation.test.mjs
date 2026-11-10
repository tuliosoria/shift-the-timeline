import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePromptScope,evaluateInvalidResponses,evaluateEvidenceIsolation,evaluateWorkerFallbacks,evaluateInterviews} from './helpers/interview-evaluation.mjs';
test('adversarial questions remain untrusted scoped provider data without private extras',evaluatePromptScope);
test('real provider rejects malformed response contracts using only mocked transport',evaluateInvalidResponses);
test('invented mock narration cannot alter canonical evidence or its sharing',evaluateEvidenceIsolation);
test('invalid provider responses fall back without changing canonical answers',evaluateWorkerFallbacks);

test('complete evaluator runs with ambient fetch denied',async()=>{
 const original=globalThis.fetch;let attempted=0;
 globalThis.fetch=async()=>{attempted++;throw new Error('Ambient network denied by offline evaluation');};
 try {const report=await evaluateInterviews();assert.equal(report.ok,true);assert.equal(attempted,0);}
 finally {globalThis.fetch=original;}
});
