import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument} from './helpers/fake-dom.mjs';
const toast = await import('../public/toast.js');

const PAGE = '<div id="main"><textarea id="question"></textarea></div><div id="toasts" role="status" aria-live="polite"></div>';
function setup() {
  const doc = createDocument(PAGE), timers = [];
  const schedule = (fn, ms) => { timers.push({fn, ms}); return timers.length; };
  const toaster = toast.createToaster({document: doc, duration: 4000, schedule});
  const tick = () => timers.shift()?.fn();
  const shown = () => doc.querySelectorAll('#toasts .toast').map(t => t.textContent);
  return {doc, toaster, timers, tick, shown};
}
const room = (deductions, over = {}) => ({code: 'ABCD2345', me: {id: 'p1', deductions}, ...over});
const d = (id, text = `Fact ${id}.`) => ({id, text, suspectId: 'mara', round: 1});

test('queues multiple', () => {
  const {toaster, timers, tick, shown} = setup();
  toaster.showUnlocked([d('a'), d('b')]);
  toaster.showUnlocked([d('c')]);
  assert.deepEqual(shown(), ['Deduction unlockedFact a.'], 'one at a time');
  assert.equal(timers[0].ms, 4000);
  tick();
  assert.deepEqual(shown(), ['Deduction unlockedFact b.']);
  tick();
  assert.deepEqual(shown(), ['Deduction unlockedFact c.']);
  tick();
  assert.deepEqual(shown(), []);
  toaster.showUnlocked([d('e')]);
  assert.deepEqual(shown(), ['Deduction unlockedFact e.'], 'a later unlock starts a new run');
});

test('does not steal focus', () => {
  const {doc, toaster} = setup();
  const field = doc.getElementById('question');
  field.focus();
  toaster.showUnlocked([d('a', 'The booth was empty at 17:40.')]);
  assert.equal(doc.activeElement, field);
  const el = doc.querySelector('#toasts .toast');
  assert.equal(el.localName, 'div');
  assert.equal(el.hasAttribute('tabindex'), false);
  assert.equal(el.querySelectorAll('button, a, input').length, 0);
  assert.equal(doc.getElementById('toasts').getAttribute('role'), 'status');
});

test('toast text is set as text, never parsed as markup', () => {
  const {doc, toaster} = setup();
  toaster.showUnlocked([d('a', '<img src=x onerror=alert(1)>')]);
  assert.equal(doc.querySelectorAll('#toasts img').length, 0);
  assert.match(doc.querySelector('#toasts .toast').textContent, /<img src=x/);
});

test('no toast on initial state', () => {
  const next = room([d('a'), d('b')]);
  assert.deepEqual(toast.freshDeductions(null, next), [], 'first load');
  assert.deepEqual(toast.freshDeductions(room([d('a')], {code: 'ZZZZ2345'}), next), [], 'another room');
  assert.deepEqual(toast.freshDeductions(room([d('a')], {me: {id: 'p2', deductions: []}}), next), [], 'another player');
  assert.deepEqual(toast.freshDeductions(room([d('a')]), next).map(x => x.id), ['b'], 'only the new one');
  assert.deepEqual(toast.freshDeductions(next, next), []);
});
