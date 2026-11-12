import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GameService} from '../server/game.mjs';
import {TRAIN_CASE as caseData, CASES as catalog} from './fixtures/case.mjs';
import {deductionSource, renderDeductions, renderTabBar} from '../public/views.js';
import {createUiState} from '../public/ui-state.js';

function game() {
  const service = new GameService({caseData, catalog});
  const host = service.create('Ada', caseData.id, randomUUID());
  const players = [host, ...['Bo', 'Cy'].map(n => service.join(host.code, n, randomUUID()))];
  const act = (player, type, data = {}) => service.act(host.code, player.token, {type, id: randomUUID(), ...data});
  act(host, 'start');
  act(host, 'select', {round: 1, suspectId: 'suspect-0'});
  const state = act(host, 'ask', {round: 1, question: 'Where were you?'});
  return {service, host, players, act, state};
}

test('source receipts identify the exact private answer and remain stable across repeats and revisits', () => {
  const {service, host, players, act, state} = game();
  const original = state.me.interviews[0].messages[0], deduction = state.me.deductions[0];
  assert.equal(deduction.messageId, original.id);
  act(host, 'ask', {round: 1, question: 'Where were you?'});
  act(host, 'advance', {round: 1, confirmed: true});
  act(host, 'select', {round: 2, suspectId: 'suspect-0'});
  const later = act(host, 'ask', {round: 2, question: 'Where were you?'});
  assert.equal(later.me.deductions[0].messageId, original.id);
  const source = deductionSource(later, later.me.deductions[0]);
  assert.equal(source.interview.round, 1);
  assert.equal(source.message.id, original.id);
  assert.equal(later.me.interviews[1].messages.length, 1, 'repetition rules are unchanged');
  for (const p of players.slice(1)) {
    const other = service.view(host.code, p.token);
    assert.deepEqual(other.me.interviews, []);
    assert.deepEqual(other.me.deductions, []);
    assert.ok(!JSON.stringify(other).includes(original.id));
    assert.ok(!renderDeductions(other, {notebook: {section: 'interviews'}}).includes(original.question));
  }
});

test('legacy evidence uses an exact unlock receipt or links only to the interview', () => {
  const {state} = game(), d = state.me.deductions[0];
  delete d.messageId;
  assert.equal(deductionSource(state, d).message.id, state.me.interviews[0].messages[0].id);
  state.me.interviews[0].messages[0].unlocked = [];
  assert.equal(deductionSource(state, d).message, undefined);
  assert.match(renderDeductions(state), /Review source interview/);
  state.me.interviews = [];
  assert.equal(deductionSource(state, d), null);
  assert.doesNotMatch(renderDeductions(state), /data-interview=/);
});

test('review is read-only, escaped and distinct from the current writable interview', () => {
  const {state} = game(), i = state.me.interviews[0];
  i.messages[0].question = '<img onerror=alert(1)>私';
  i.messages[0].reply = '<script>secret</script>';
  const before = JSON.stringify(state);
  const html = renderDeductions(state, {notebook: {interview: '1:suspect-0', message: i.messages[0].id, deduction: state.me.deductions[0].id}, archiveDraft: 'not sent <draft>'});
  assert.match(html, /Read-only/);
  assert.match(html, /source-answer/);
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;secret&lt;\/script&gt;/);
  assert.match(html, /not sent &lt;draft&gt;/);
  assert.doesNotMatch(html, /<textarea|question-form|data-submit|data-chip|<script>|<img onerror/);
  assert.equal(JSON.stringify(state), before, 'view never mutates engine state');
});

test('notebook survives turn transitions, summons and reveal without exposing locked clues', () => {
  const {state} = game();
  const local = {briefingSeen: true, lastSeenRound: 1, tab: 'deductions', notebook: {section: 'interviews', interview: '1:suspect-0'}};
  for (const phase of ['investigation', 'accusation', 'reveal']) {
    const next = {...state, phase, round: 2};
    assert.match(renderTabBar(next, local), /Deductions/);
    const html = renderDeductions(next, local);
    assert.match(html, /Turn 1/);
    assert.match(html, /Read-only/);
    for (const d of caseData.deductions.filter(d => !state.me.deductions.some(u => u.id === d.id))) assert.ok(!html.includes(d.text));
  }
});

test('notebook location and unsent drafts recover separately and stay scoped to room and player', () => {
  let value = null;
  const storage = {getItem: () => value, setItem: (_, v) => { value = v; }};
  const ui = createUiState(storage), context = {room: 'ABCDEFGH', player: 'ada', round: 1, suspect: 'one'};
  ui.writeDraft(context, 'A newer thought');
  const location = {open: true, section: 'interviews', interview: '1:one', message: 'm1', deduction: null};
  ui.saveNotebook(context.room, context.player, location);
  const restored = createUiState(storage);
  assert.deepEqual(restored.notebook(context.room, context.player), {...location, query: '', suspect: null, returnTab: 'investigate', returnSelected: null, returnRound: null, returnPhase: null});
  assert.equal(restored.draft(context), 'A newer thought');
  assert.equal(restored.notebook(context.room, 'bo').interview, null);
  assert.equal(restored.notebook('OTHERONE', context.player).interview, null);
  restored.forget(context.room, context.player);
  assert.equal(restored.notebook(context.room, context.player).open, false);
  assert.equal(restored.draft(context), '');
});

test('blocked storage is labelled as an in-memory draft, never promised to survive reload', () => {
  const {state} = game();
  const ui = createUiState({getItem() { return null; }, setItem() { throw Error('Quota'); }});
  const context = {room: state.code, player: state.me.id, round: 1, suspect: 'suspect-0'};
  ui.writeDraft(context, 'Only in memory');
  const html = renderDeductions(state, {notebook: {interview: '1:suspect-0'}, archiveDraft: ui.draft(context), draftsPersistent: ui.persistent});
  assert.match(html, /Only in this open tab.*reloading will lose this draft/);
  assert.doesNotMatch(html, /Saved on this browser/);
});


test('suspect files show all and only your visits and unlocked source receipts', () => {
  const {host, act, state} = game();
  act(host, 'advance', {round: 1, confirmed: true});
  act(host, 'select', {round: 2, suspectId: 'suspect-0'});
  const next = act(host, 'ask', {round: 2, question: 'Where were you again?'});
  const html = renderDeductions(next, {notebook: {suspect: 'suspect-0'}});
  assert.match(html, /Turn 1/); assert.match(html, /Turn 2/);
  assert.match(html, new RegExp(`data-message="${state.me.interviews[0].messages[0].id}"`));
  assert.doesNotMatch(html, /Synthetic private brief|question-form|data-submit|data-action="summon"/);
  assert.doesNotMatch(renderDeductions(next, {notebook: {suspect: 'suspect-1'}}), /data-interview=/);
  for (const d of caseData.deductions.filter(d => !next.me.deductions.some(u => u.id === d.id))) assert.ok(!html.includes(d.text));
  const source = renderDeductions(next, {notebook: {suspect: 'suspect-0', interview: '1:suspect-0'}});
  assert.match(source, /Back to suspect file/);
  assert.doesNotMatch(renderDeductions(next, {notebook: {suspect: 'suspect-1', interview: '1:suspect-0'}}), /Where were you/);
});

test('suspect file recovery remains scoped and sanitises navigation fields', () => {
  let value; const storage = {getItem: () => value, setItem: (_, v) => {value = v;}};
  const ui = createUiState(storage);
  ui.saveNotebook('ROOM', 'PLAYER', {open: true, suspect: 'suspect-0', returnTab: 'external', returnRound: 4, returnPhase: 'accusation', returnSelected: 'suspect-0'});
  const restored = createUiState(storage);
  assert.equal(restored.notebook('ROOM', 'PLAYER').suspect, 'suspect-0');
  assert.equal(restored.notebook('ROOM', 'PLAYER').returnTab, 'investigate');
  assert.equal(restored.notebook('OTHER', 'PLAYER').suspect, null);
  assert.equal(restored.notebook('ROOM', 'OTHER').suspect, null);
});
