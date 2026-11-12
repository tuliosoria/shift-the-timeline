import test from 'node:test';
import assert from 'node:assert/strict';
import {searchEvidence, renderEvidenceResults, renderDeductions} from '../public/views.js';
import {createUiState} from '../public/ui-state.js';

const state = () => ({suspects: [{id: 'one', name: 'Inês Example', profile: 'A public profile, not testimony.'}],
  me: {interviews: [{round: 1, suspectId: 'one', opening: 'I work at the gallery.', messages: [
    {id: 'm1', question: 'What about the blue key?', reply: 'I put the blue key inside a vase.', status: 'canonical', unlocked: ['d1']},
    {id: 'm2', question: 'And the red box?', reply: 'Unpublished SECRET', status: 'pending'},
  ]}], deductions: [{id: 'd1', suspectId: 'one', round: 1, messageId: 'm1', text: 'The key was in a vase.'}]}, deductionTotal: 6});

test('search matches every word across private question and answer, case and accent insensitive', () => {
  const s = state(), before = JSON.stringify(s);
  assert.equal(searchEvidence(s, 'INeS BLUE vase').length, 1);
  assert.equal(searchEvidence(s, 'red vase').length, 0);
  assert.equal(searchEvidence(s, 'gallery')[0].kind, 'opening');
  assert.equal(searchEvidence(s, 'vase').length, 2);
  assert.equal(searchEvidence(s, 'SECRET').length, 0, 'pending reply data is not searchable');
  assert.equal(searchEvidence(s, 'red box')[0].message.id, 'm2');
  assert.equal(searchEvidence(s, 'public profile').length, 0);
  assert.deepEqual(searchEvidence(s, '   '), []);
  assert.equal(JSON.stringify(s), before);
});

test('source links target the exact personal receipt, even after revisiting a suspect', () => {
  const s = state();
  s.me.interviews.push({round: 2, suspectId: 'one', messages: [{id: 'm3', question: 'The vase?', reply: 'Another answer', status: 'complete'}]});
  const results = searchEvidence(s, 'vase');
  assert.equal(results[0].message.id, 'm3');
  const clue = results.find(r => r.kind === 'deduction');
  assert.equal(clue.message.id, 'm1');
  assert.equal(clue.interview.round, 1);
  const html = renderEvidenceResults(s, 'vase');
  assert.match(html, /id="search-deduction-d1" data-interview="1:one" data-message="m1"/);
  assert.match(html, /id="search-answer-m3" data-interview="2:one" data-message="m3"/);
  assert.match(renderDeductions(s, {notebook: {section: 'search', interview: '1:one', query: 'vase'}}), /Back to search results/);
});

test('search escapes query, questions, replies and labels; never includes unearned evidence', () => {
  const s = state();
  s.suspects[0].name = '<img src=x onerror=alert(1)>';
  s.me.interviews[0].messages[0].reply = '<script>key</script>';
  const html = renderDeductions(s, {notebook: {section: 'search', query: '"><img>'}});
  assert.match(html, /value="&quot;&gt;&lt;img&gt;"/);
  const results = renderEvidenceResults(s, 'key');
  assert.match(results, /&lt;script&gt;key&lt;\/script&gt;/);
  assert.match(results, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(results, /<script>|<img |data-submit|question-form|Unpublished SECRET/);
  assert.equal(searchEvidence({...s, me: {interviews: [], deductions: []}}, 'key').length, 0);
});

test('legacy deductions remain searchable without inventing a source answer', () => {
  const s = state();
  delete s.me.deductions[0].messageId;
  assert.equal(searchEvidence(s, 'vase').find(r => r.kind === 'deduction').message.id, 'm1');
  s.me.interviews = [];
  const html = renderEvidenceResults(s, 'vase');
  assert.match(html, /source interview is no longer available/);
  assert.doesNotMatch(html, /data-interview=/);
});

test('search excerpts include late matches and remain bounded', () => {
  const s = state(); s.me.interviews[0].messages[0].reply = 'x'.repeat(1500) + ' key at the end';
  const html = renderEvidenceResults(s, 'key');
  assert.match(html, /…x+ key at the end/);
  assert.ok(!html.includes('x'.repeat(181)));
  s.me.interviews[0].messages[0].reply = 'e\u0301'.repeat(1500) + ' key at the end';
  assert.match(renderEvidenceResults(s, 'key'), /key at the end/);
});

test('search location and query recover only for the same room/player and are length bounded', () => {
  let value;
  const storage = {getItem: () => value, setItem: (_, v) => { value = v; }};
  const ui = createUiState(storage);
  ui.saveNotebook('room', 'player', {open: true, section: 'search', query: 'x'.repeat(150), interview: '1:one', message: 'm1'});
  const recovered = createUiState(storage);
  assert.equal(recovered.notebook('room', 'player').section, 'search');
  assert.equal(recovered.notebook('room', 'player').query.length, 100);
  assert.equal(recovered.notebook('other', 'player').query, '');
  assert.equal(recovered.notebook('room', 'other').query, '');
  recovered.forget('room', 'player');
  assert.equal(recovered.notebook('room', 'player').query, '');
});
