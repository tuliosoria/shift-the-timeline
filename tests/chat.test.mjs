import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument, fire, fakeTarget} from './helpers/fake-dom.mjs';
import {createUiState, uiContext} from '../public/ui-state.js';
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
  fire($('#question'), 'keydown', {key: 'Enter', isComposing: true});
  fire($('#question'), 'keydown', {key: 'Enter', keyCode: 229});
  assert.deepEqual(sent, [], 'an IME composition (or Safari\'s commit Enter) never sends');
  const enter = fire($('#question'), 'keydown', {key: 'Enter'});
  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(sent, ['Where were you at eight?']);
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
  assert.equal(doc.getElementById('announcer').textContent, 'Ben, AI reply: Reply 2.');
  assert.equal(transcript.scrollTop, transcript.scrollHeight);
  doc.getElementById('announcer').textContent = '';
  view.update(state([message(1), message(2)]));
  assert.equal(doc.getElementById('announcer').textContent, '', 'never twice');
});

test('chips fill a reviewable draft without sending', () => {
  const {doc, view, sent, $} = setup();
  view.update(state());
  const chip = $('.chip');
  fire(chip, 'click');
  assert.deepEqual(sent, []);
  assert.equal($('#question').value, chip.dataset.chip);
  assert.ok(chip.disabled, 'a filled draft disables suggestions');
  fire(chip, 'click');
  assert.deepEqual(sent, []);
  fire($('.send'), 'click');
  assert.deepEqual(sent, [chip.dataset.chip]);
  assert.equal(doc.activeElement, $('#question'));
});

test('the draft is restored and saved per keystroke', () => {
  const {view, drafts, $, type} = setup({draft: 'Half a quest'});
  view.update(state());
  assert.equal($('#question').value, 'Half a quest');
  assert.equal($('.send').disabled, false);
  $('#transcript').scrollTop = 0;
  type('Half a question');
  assert.equal(drafts.at(-1), 'Half a question');
  assert.equal($('#transcript').scrollTop, $('#transcript').scrollHeight, 'a growing field keeps the newest bubble anchored');
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
  const {doc, root, view, $} = setup();
  view.update(state([message(1), message(2), message(3, 'pending')]));
  assert.ok($('#question'), 'the composer stays while the last reply is pending');
  assert.equal($('.send').disabled, true);
  assert.equal($('#question').readOnly, true, 'nothing can be typed that would be lost with the composer');
  $('#question').focus();
  view.update(state([message(1), message(2), message(3)]));
  assert.equal(doc.activeElement, $('.done button'), 'focus moves to Continue instead of falling to the page');
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
  view.update(state(), {outgoing: {text: 'Still sending?', count: 0}});
  settle(false);
  await new Promise(r => setTimeout(r));
  assert.equal($('#question').value, '');
  assert.equal($('#transcript').querySelectorAll('.b.me').at(-1).textContent, 'Still sending?');
  assert.equal($('.send').disabled, true, 'only the Retry in the notice may resend it');
});

test('a held retry of a repeated question still shows until the server has it', () => {
  const {view, $} = setup();
  const asked = {...message(1), question: 'What did you notice?'};
  view.update(state([asked]), {outgoing: {text: 'What did you notice?', count: 1}});
  assert.equal($('#transcript').querySelectorAll('.b.me').length, 2, 'same text, not yet delivered');
  assert.equal($('.send').disabled, true);
  view.update(state([asked, {...message(2, 'pending'), question: 'What did you notice?'}]), {outgoing: {text: 'What did you notice?', count: 1}});
  assert.equal($('#transcript').querySelectorAll('.b.me').length, 2, 'no duplicate once delivered');
});

function keyboardSetup({innerHeight = 844, coarse = false} = {}) {
  const visualViewport = fakeTarget({width: 390, height: innerHeight, offsetTop: 0});
  const win = fakeTarget({innerHeight, visualViewport, matchMedia: q => ({matches: coarse && q === '(pointer: coarse)'})});
  const t = setup({viewport: win});
  t.view.update(state([message(1)]));
  const css = name => t.doc.documentElement.style.getPropertyValue(name), open = () => t.doc.documentElement.classList.contains('kb-open');
  return {...t, win, visualViewport, css, open};
}

test('iOS keyboard: the app follows the panned visual viewport and the tab bar steps aside', () => {
  const {doc, view, $, visualViewport, css, open} = keyboardSetup();
  assert.equal(doc.documentElement.classList.contains('vv-pinned'), true);
  assert.equal(css('--vvh'), '844px');
  $('#question').focus();
  assert.equal(open(), false, 'a focused field alone is not a keyboard on a desktop');
  // Safari keeps the layout viewport (innerHeight) and pans the visual one up over the keyboard.
  Object.assign(visualViewport, {height: 508, offsetTop: 336});
  $('#transcript').scrollTop = 0;
  visualViewport.emit('scroll');
  assert.equal(css('--vvh'), '508px');
  assert.equal(css('--vvtop'), '336px');
  assert.equal(css('--kb'), '336px');
  assert.equal(open(), true);
  assert.equal($('#transcript').scrollTop, $('#transcript').scrollHeight, 'the newest bubble stays in view');
  $('#question').blur();
  assert.equal(open(), false);
  assert.equal(css('--kb'), '0px');
  view.destroy();
  assert.equal(visualViewport.listenerCount('resize') + visualViewport.listenerCount('scroll'), 0);
  for (const name of ['--kb', '--vvh', '--vvtop']) assert.equal(css(name), '');
  assert.equal(doc.documentElement.classList.contains('vv-pinned'), false);
});

test('Android keyboard: a resized layout with no inset still counts as the keyboard', () => {
  const {$, win, visualViewport, css, open} = keyboardSetup();
  $('#question').focus();
  // interactive-widget=resizes-content shrinks the layout and visual viewports together.
  win.innerHeight = visualViewport.height = 664;
  visualViewport.emit('resize');
  assert.equal(open(), true);
  assert.equal(css('--vvh'), '664px');
  assert.equal(css('--kb'), '180px');
});

test('a touch device treats the focused field as the keyboard', () => {
  const {$, open} = keyboardSetup({coarse: true});
  assert.equal(open(), false);
  $('#question').focus();
  assert.equal(open(), true);
});

// The app's command owner restores a definitely rejected question in persisted UI state
// before rendering. The original chat may already be destroyed; its settle callback is
// deliberately left with the old outgoing snapshot, just as when navigating between tabs.
for (const returnBeforeRejection of [false, true]) test(`rejected draft survives destroyed chat (return before rejection: ${returnBeforeRejection})`, async () => {
  const doc = createDocument('<main id="main"></main><div id="announcer"></div>');
  const root = doc.getElementById('main'), ui = createUiState({getItem: () => null, setItem() {}});
  const snapshot = state(), context = uiContext(snapshot), question = 'Where was the missing key?';
  let settle;
  const mount = () => chat.mountChat(root, {draft: ui.draft(context), onDraft: text => ui.writeDraft(context, text),
    onSend: () => new Promise(resolve => { settle = resolve; })});
  let view = mount(); view.update(snapshot, {draft: ui.draft(context)});
  root.querySelector('#question').value = question; fire(root.querySelector('#question'), 'input');
  fire(root.querySelector('.send'), 'click');
  view.update(snapshot, {busy: true, outgoing: {text: question, count: 0}, draft: ui.draft(context)});
  view.destroy(); root.innerHTML = '<section>Deductions</section>';
  if (returnBeforeRejection) {
    view = mount(); view.update(snapshot, {busy: true, outgoing: {text: question, count: 0}, draft: ui.draft(context)});
    assert.equal(root.querySelector('#question').value, '', 'a held retry is not a draft');
  }
  // Definite rejection: app.run restores only if there is no newer saved draft.
  if (!ui.draft(context)) ui.writeDraft(context, question);
  if (returnBeforeRejection) view.update(snapshot, {busy: false, draft: ui.draft(context)});
  settle(false); await new Promise(resolve => setTimeout(resolve));
  if (!returnBeforeRejection) { view = mount(); view.update(snapshot, {draft: ui.draft(context)}); }
  assert.equal(root.querySelector('#question').value, question);
  assert.equal(root.querySelector('.send').disabled, false);
  assert.equal(ui.draft(context), question);
  assert.equal(root.querySelectorAll('#transcript .b.me').length, 0, 'refusal removes the optimistic bubble');
});

test('owner-restored drafts never overwrite newer typing or cross interview contexts', async () => {
  const doc = createDocument('<main id="main"></main><div id="announcer"></div>');
  const root = doc.getElementById('main'), ui = createUiState({getItem: () => null, setItem() {}});
  const snapshot = state(), context = uiContext(snapshot);
  const mount = current => {
    const key = uiContext(current);
    const view = chat.mountChat(root, {draft: ui.draft(key), onDraft: text => ui.writeDraft(key, text), onSend() {}});
    view.update(current, {draft: ui.draft(key)});
    return view;
  };
  let view = mount(snapshot);
  root.querySelector('#question').value = 'A newer thought'; fire(root.querySelector('#question'), 'input');
  if (!ui.draft(context)) ui.writeDraft(context, 'Rejected older question');
  view.update(snapshot, {draft: ui.draft(context)});
  assert.equal(root.querySelector('#question').value, 'A newer thought');
  // Even a late render with an older saved value must not overwrite the current field.
  view.update(snapshot, {draft: 'Rejected older question'});
  assert.equal(root.querySelector('#question').value, 'A newer thought');
  view.destroy();
  const next = {...snapshot, round: 2, me: {...snapshot.me, interviews: [{round: 2, suspectId: 'ben', closed: false, messages: []}]}};
  view = mount(next);
  assert.equal(root.querySelector('#question').value, '', 'previous interview recovery is not a next-turn draft');
  assert.equal(ui.draft(context), 'A newer thought');
});

test('confirmed sends do not rehydrate the cleared draft', async () => {
  const doc = createDocument('<main id="main"></main><div id="announcer"></div>');
  const root = doc.getElementById('main');
  let settle;
  const view = chat.mountChat(root, {draft: 'Saved before sending?', onSend: () => new Promise(resolve => { settle = resolve; })});
  view.update(state(), {draft: 'Saved before sending?'});
  fire(root.querySelector('.send'), 'click');
  view.update(state(), {busy: true, outgoing: {text: 'Saved before sending?', count: 0}, draft: ''});
  assert.equal(root.querySelector('#question').value, '');
  view.update(state([{...message(1), question: 'Saved before sending?'}]), {draft: ''});
  settle(true); await new Promise(resolve => setTimeout(resolve));
  assert.equal(root.querySelector('#question').value, '');
});


test('new replies do not move a reader and remain reachable after the composer closes', () => {
  const {doc, view, $} = setup();
  view.update(state([message(1), message(2), message(3, 'pending')]));
  const transcript = $('#transcript');
  transcript.scrollTop = 20;
  fire(transcript, 'scroll');
  view.update(state([message(1), message(2), message(3)]));
  assert.equal(transcript.scrollTop, 20);
  assert.equal($('.new-reply').hidden, false);
  assert.equal($('#question'), null);
  view.update(state([message(1), message(2), message(3)]));
  assert.equal($('.new-reply').hidden, false, 'polling keeps the unread cue');
  fire($('.new-reply'), 'click');
  assert.equal(transcript.scrollTop, transcript.scrollHeight);
  assert.equal($('.new-reply').hidden, true);
  assert.equal(doc.activeElement, transcript, 'focus is not stranded on a hidden button');
});


test('suggestions never overwrite typed or restored text, including whitespace', () => {
  for (const draft of ['A question in progress', '   ']) {
    const {view, sent, $, drafts} = setup({draft}); view.update(state());
    const chip = $('.chip'); assert.ok(chip.disabled); fire(chip, 'click');
    assert.equal($('#question').value, draft); assert.deepEqual(sent, []); assert.deepEqual(drafts, []);
  }
});

test('returning to a chat restores reading position and flags a reply completed while away', () => {
  const {view, $, root} = setup(); view.update(state([message(1), message(2, 'pending')]));
  const transcript = $('#transcript'); transcript.scrollTop = 0; transcript.scrollHeight = 900; transcript.clientHeight = 200;
  fire(transcript, 'scroll'); const saved = view.readingPosition();
  view.destroy();
  const restored = chat.mountChat(root, {onSend() {}}); restored.update(state([message(1), message(2)]));
  restored.restoreReadingPosition(saved);
  assert.equal(root.querySelector('#transcript').scrollTop, 0);
  assert.equal(root.querySelector('.new-reply').hidden, false);
});


test('an existing unread reply indicator survives leaving and returning without another reply', () => {
  const {view, $, root} = setup(); view.update(state([message(1), message(2, 'pending')]));
  const transcript = $('#transcript'); transcript.scrollTop = 0; transcript.scrollHeight = 900; transcript.clientHeight = 200;
  fire(transcript, 'scroll'); view.update(state([message(1), message(2)]));
  assert.equal($('.new-reply').hidden, false);
  const saved = view.readingPosition(); view.destroy();
  const restored = chat.mountChat(root, {onSend() {}}); restored.update(state([message(1), message(2)]));
  restored.restoreReadingPosition(saved);
  assert.equal(root.querySelector('.new-reply').hidden, false);
  fire(root.querySelector('.new-reply'), 'click');
  assert.equal(restored.readingPosition().unread, false);
});
