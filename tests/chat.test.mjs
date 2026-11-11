import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument, fire, fakeTarget} from './helpers/fake-dom.mjs';
const chat = await import('../public/chat.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

let version = 1;
const message = (n, status = 'complete') => ({id: `m${n}`, question: `Question ${n}?`, status, reply: status === 'pending' ? null : `Reply ${n}.`, unlocked: []});
function state(messages = [], {closed = messages.length >= 3} = {}) {
  return {code: 'ABCDEFGH', version: version++, phase: 'investigation', round: 1, config: {maxQuestions: 3, rounds: 4},
    case: {title: 'Synthetic case'}, clock: {time: '20:00', hoursLeft: 24},
    players: [{id: 'p1', name: 'Ada'}, {id: 'p2', name: 'Bo'}, {id: 'p3', name: 'Cy'}],
    suspects: [{id: 'ben', name: 'Ben Hale', role: 'Night porter', initials: 'BH', color: '#335577'}],
    deductionTotal: 6, me: {id: 'p1', deductions: [], interviews: [{round: 1, suspectId: 'ben', opening: 'Evening, agent.', closed, messages}]}};
}
function setup({draft = '', viewport} = {}) {
  assert.equal(typeof chat.mountChat, 'function', 'chat.mountChat exists');
  const doc = createDocument('<main id="main"></main><div id="announcer" aria-live="polite"></div>');
  if (viewport) doc.defaultView = viewport;
  const root = doc.getElementById('main'), sent = [], drafts = [];
  const view = chat.mountChat(root, {onSend: text => { sent.push(text); return new Promise(() => {}); }, draft, onDraft: text => drafts.push(text)});
  const $ = sel => root.querySelector(sel);
  const type = text => { const field = $('#question'); field.focus(); field.value = text; fire(field, 'input'); };
  return {doc, root, view, sent, drafts, $, type};
}

test('enter sends, shift+enter does not', () => {
  const {view, sent, $, type} = setup();
  view.update(state());
  type('Where were you at eight?');
  const newline = fire($('#question'), 'keydown', {key: 'Enter', shiftKey: true});
  assert.equal(newline.defaultPrevented, false, 'Shift+Enter keeps the native newline');
  assert.deepEqual(sent, []);
  const enter = fire($('#question'), 'keydown', {key: 'Enter'});
  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(sent, ['Where were you at eight?']);
  fire($('#question'), 'keydown', {key: 'Enter', isComposing: true});
  assert.deepEqual(sent, ['Where were you at eight?'], 'an IME composition never sends');
});

test('field cleared and focused after send', () => {
  const {doc, view, sent, drafts, $, type} = setup();
  view.update(state());
  type('Who did you see?');
  const field = $('#question');
  assert.equal(fire($('.send'), 'mousedown').defaultPrevented, true, 'tapping Send does not take focus (the keyboard stays up)');
  fire($('.send'), 'click');
  assert.deepEqual(sent, ['Who did you see?']);
  assert.equal(field.value, '');
  assert.equal(doc.activeElement, field, 'focus stays in the composer');
  assert.equal(drafts.at(-1), '', 'the saved draft is cleared on send');
  const transcript = $('#transcript');
  assert.equal(transcript.querySelectorAll('.b.me').at(-1).textContent, 'Who did you see?', 'optimistic bubble');
  assert.equal(transcript.querySelector('.typing').getAttribute('aria-label'), 'Ben is replying');
  assert.equal(transcript.scrollTop, transcript.scrollHeight, 'scrolled to the newest message');
  assert.equal($('.send').disabled, true, 'a second tap cannot send again');
  fire($('.send'), 'click');
  assert.equal(sent.length, 1);
});

test('send disabled while pending', () => {
  const {view, sent, $, type} = setup();
  view.update(state());
  assert.equal($('.send').disabled, true, 'disabled while empty');
  type('   ');
  assert.equal($('.send').disabled, true, 'whitespace is empty');
  view.update(state([message(1, 'pending')]));
  type('Next question?');
  assert.equal($('.send').disabled, true);
  assert.ok($('.chip').disabled, 'chips wait too');
  fire($('#question'), 'keydown', {key: 'Enter'});
  assert.deepEqual(sent, []);
  assert.equal($('#question').value, 'Next question?', 'typing ahead is kept');
  view.update(state([message(1)]));
  assert.equal($('.send').disabled, false);
});

test('a reply scrolls to the bottom and is announced once', () => {
  const {doc, view, $} = setup();
  view.update(state([message(1)]));
  assert.equal(doc.getElementById('announcer').textContent, '', 'nothing is announced on load');
  view.update(state([message(1), message(2, 'pending')]));
  const transcript = $('#transcript');
  transcript.scrollTop = 0;
  view.update(state([message(1), message(2)]));
  assert.equal(doc.getElementById('announcer').textContent, 'Ben: Reply 2.');
  assert.equal(transcript.scrollTop, transcript.scrollHeight);
  doc.getElementById('announcer').textContent = '';
  view.update(state([message(1), message(2)]));
  assert.equal(doc.getElementById('announcer').textContent, '', 'never twice');
});

test('chips fill and send in one tap', () => {
  const {doc, view, sent, $} = setup();
  view.update(state());
  const chip = $('.chip');
  fire(chip, 'click');
  assert.deepEqual(sent, [chip.dataset.chip]);
  assert.equal($('#question').value, '');
  assert.equal(doc.activeElement, $('#question'));
});

test('the draft is restored and saved per keystroke', () => {
  const {view, drafts, $, type} = setup({draft: 'Half a quest'});
  view.update(state());
  assert.equal($('#question').value, 'Half a quest');
  assert.equal($('.send').disabled, false);
  type('Half a question');
  assert.equal(drafts.at(-1), 'Half a question');
});

test('polling update keeps caret and draft', () => {
  const {doc, view, $, type} = setup();
  view.update(state([message(1, 'pending')]));
  type('Where did the key go?');
  const field = $('#question');
  field.setSelectionRange(6, 9);
  view.update(state([message(1)]));
  view.update(state([message(1)]));
  assert.equal($('#question'), field, 'the composer is never rebuilt');
  assert.equal(field.value, 'Where did the key go?');
  assert.deepEqual([field.selectionStart, field.selectionEnd], [6, 9]);
  assert.equal(doc.activeElement, field);
  assert.equal($('#transcript').querySelectorAll('.b.them').length, 2, 'opening plus the new reply');
});

test('third reply swaps composer for end-of-turn message', () => {
  const {root, view, $} = setup();
  view.update(state([message(1), message(2), message(3, 'pending')]));
  assert.ok($('#question'), 'the composer stays while the last reply is pending');
  assert.equal($('.send').disabled, true);
  view.update(state([message(1), message(2), message(3)]));
  assert.equal($('#question'), null);
  assert.equal($('.chips'), null);
  assert.match(root.textContent, /That's all your questions for this turn\./);
  assert.equal($('.count').textContent.trim(), '3 of 3');
});

test('an optimistic bubble yields to the server copy and a failed send restores the text', async () => {
  const doc = createDocument('<main id="main"></main><div id="announcer"></div>');
  let settle;
  const view = chat.mountChat(doc.getElementById('main'), {onSend: () => new Promise(r => { settle = r; }), draft: '', onDraft() {}});
  const $ = sel => doc.getElementById('main').querySelector(sel);
  view.update(state());
  $('#question').value = 'Lost question?'; fire($('#question'), 'input');
  fire($('.send'), 'click');
  settle(false);
  await new Promise(r => setTimeout(r));
  assert.equal($('#question').value, 'Lost question?', 'a rejected question returns to the field');
  assert.equal($('#transcript').querySelectorAll('.b.me').length, 0);
  assert.equal($('.send').disabled, false);
  fire($('.send'), 'click');
  view.update(state([{...message(1, 'pending'), question: 'Lost question?'}]));
  assert.equal($('#transcript').querySelectorAll('.b.me').length, 1, 'no duplicate once the server has it');
});

test('a retry the app still holds keeps the bubble without restoring the text', async () => {
  const doc = createDocument('<main id="main"></main><div id="announcer"></div>');
  let settle;
  const view = chat.mountChat(doc.getElementById('main'), {onSend: () => new Promise(r => { settle = r; }), draft: '', onDraft() {}});
  const $ = sel => doc.getElementById('main').querySelector(sel);
  view.update(state());
  $('#question').value = 'Still sending?'; fire($('#question'), 'input');
  fire($('.send'), 'click');
  view.update(state(), {outgoing: 'Still sending?'});
  settle(false);
  await new Promise(r => setTimeout(r));
  assert.equal($('#question').value, '');
  assert.equal($('#transcript').querySelectorAll('.b.me').at(-1).textContent, 'Still sending?');
  assert.equal($('.send').disabled, true, 'only the Retry in the notice may resend it');
});

test('keyboard inset sets --kb and keeps the newest message in view', () => {
  const visualViewport = fakeTarget({height: 844, offsetTop: 0});
  const win = fakeTarget({innerHeight: 844, visualViewport});
  const {doc, view, $} = setup({viewport: win});
  view.update(state([message(1)]));
  visualViewport.height = 508;
  $('#transcript').scrollTop = 0;
  visualViewport.emit('resize');
  assert.equal(doc.documentElement.style.getPropertyValue('--kb'), '336px');
  assert.equal(doc.documentElement.classList.contains('kb-open'), true);
  assert.equal($('#transcript').scrollTop, $('#transcript').scrollHeight);
  view.destroy();
  assert.equal(visualViewport.listenerCount('resize'), 0);
  assert.equal(doc.documentElement.style.getPropertyValue('--kb'), '');
});
