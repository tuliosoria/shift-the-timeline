import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTranscript, replyProvenance} from '../public/views.js';

const state = messages => ({phase: 'investigation', round: 1, config: {maxQuestions: 3}, suspects: [{id: 'ada', name: 'Ada Finch'}],
  me: {interviews: [{round: 1, suspectId: 'ada', messages}]}});
test('answer provenance uses each answer status, with only newly unlocked deduction counts', () => {
  assert.equal(replyProvenance({status: 'complete', unlocked: []}), 'AI reply');
  assert.equal(replyProvenance({status: 'canonical', unlocked: ['a', 'a']}), 'Scripted answer · 1 new deduction');
  assert.equal(replyProvenance({status: 'complete', unlocked: ['a', 'b']}), 'AI reply · 2 new deductions');
});
test('chat distinguishes AI and scripted replies without exposing deduction ids or rendering injected markup', () => {
  const html = renderTranscript(state([
    {question: '<script>question</script>', reply: '<b>answer</b>', status: 'complete', unlocked: ['PRIVATE_ID']},
    {question: 'And then?', reply: 'An authored answer.', status: 'canonical', unlocked: []},
    {question: 'Who?', status: 'pending'},
  ]), {});
  assert.match(html, /AI reply · 1 new deduction/);
  assert.match(html, /Scripted answer/);
  assert.match(html, /Ada is replying/);
  assert.ok(!html.includes('PRIVATE_ID'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;b&gt;answer&lt;\/b&gt;/);
  assert.equal((html.match(/reply-source/g) ?? []).length, 2, 'pending questions do not claim a reply source');
});
