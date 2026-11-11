// Bootstrap, state, routing and event wiring. Views are pure (views.js); the network is api.js.
import {fetchJson, command, requestIdFor, newRequestId, pollLoop, roomGone} from './api.js';
import {createUiState, uiContext} from './ui-state.js';
import * as views from './views.js';
import {setScene} from './backdrop.js';
import {mountChat} from './chat.js';
import {showUnlocked, freshDeductions} from './toast.js';

const $ = s => document.querySelector(s);
const SESSION = 'shift-session', PENDING = 'shift-pending';
const ROOM_EXPIRED = 'This room has expired. Open or join another case.';
const store = {
  get(key) { try { return JSON.parse((key === SESSION ? localStorage : sessionStorage).getItem(key)); } catch { return null; } },
  set(key, value) { try { (key === SESSION ? localStorage : sessionStorage).setItem(key, JSON.stringify(value)); } catch { notice('Storage is unavailable. Keep this tab open to stay in the game.', true); } },
  remove(key) { try { (key === SESSION ? localStorage : sessionStorage).removeItem(key); } catch {} },
};
let uiStorage;
try { uiStorage = localStorage; } catch { uiStorage = {getItem() { throw Error('Storage unavailable'); }, setItem() { throw Error('Storage unavailable'); }}; }
const ui = createUiState(uiStorage);

const invitationCode = hash => /^#join=([A-HJ-NP-Za-hj-np-z2-9]{8})$/.exec(hash || '')?.[1]?.toUpperCase() ?? '';
let session = store.get(SESSION), pending = store.get(PENDING), state = null, busy = false, lastVersion = -1, confirmation = null, lastHeartbeat = 0;
// `reading` keeps a finished chat on screen until the player moves on, even after the turn
// itself has moved on (see views.screenFor): the transition waits for it.
const local = {briefingSeen: false, lastSeenRound: 0, tab: 'investigate', selected: null, draft: '', reading: null, entry: 'create', cases: [], invite: ''};
let chat = null, transition = {key: null, timer: null};
if (!session && !pending && invitationCode(location.hash)) Object.assign(local, {entry: 'join', invite: invitationCode(location.hash)});

const RENDER = {landing: views.renderLanding, lobby: views.renderLobby, briefing: views.renderBriefing, pick: views.renderPick, chat: views.renderChat,
  waiting: views.renderWaiting, transition: views.renderTransition, accuse: views.renderAccuse, reveal: views.renderReveal};

function notice(message, error = false) {
  const el = $('#notice');
  el.className = error ? 'show error' : 'show';
  el.textContent = message;
  if (pending && error) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Retry'; b.dataset.action = 'retry'; el.append(' ', b); }
  clearTimeout(notice.timer);
  if (!error) notice.timer = setTimeout(clearNotice, 4000);
}
function clearNotice() { const el = $('#notice'); el.className = ''; el.textContent = ''; }

// One chat per interview: polls update it in place instead of rebuilding the composer.
function chatFor(main) {
  const key = JSON.stringify([state.code, state.me.id, views.chatKey(views.currentInterview(state, local))]);
  if (chat?.key === key) return chat;
  chat?.destroy();
  const context = uiContext(state);
  chat = mountChat(main, {draft: ui.draft(context), onDraft: text => ui.writeDraft(context, text),
    onSend: question => {
      const interview = views.currentInterview(state, local);
      // `count` (messages before this one) lets the chat tell a held retry from a delivered repeat.
      return act('ask', {question, round: interview?.round ?? state.round}, {count: interview?.messages.length ?? 0});
    }});
  chat.key = key;
  return chat;
}

function render() {
  document.body.classList.toggle('busy', busy);
  if (state) Object.assign(local, ui.seen(state.code, state.me.id), {draft: ui.draft(uiContext(state))});
  const screen = views.screenFor(state, local), tabBar = views.renderTabBar(state, local);
  if (screen === 'chat') local.reading = views.chatKey(views.currentInterview(state, local));
  const tab = tabBar ? local.tab : 'investigate';
  const view = tab === 'deductions' ? 'deductions' : tab === 'case' ? 'casefile' : screen;
  const main = $('#main'), active = document.activeElement, focusId = main.contains(active) ? active?.id : null;
  const caret = focusId ? [active.selectionStart, active.selectionEnd] : null;
  const keepScroll = main.dataset.view === view ? main.scrollTop : 0;
  const entryValues = state ? {} : Object.fromEntries([...main.querySelectorAll('input[id]')].map(el => [el.id, el.value]));
  const header = views.renderHeader(state, local);
  $('#header').innerHTML = header;
  $('#header').hidden = !header || screen === 'transition';
  main.dataset.view = view;
  $('#tabbar').innerHTML = tabBar;
  if (view === 'chat') {
    const outgoing = pending?.action?.type === 'ask' && Number.isInteger(pending.count) ? {text: pending.action.question, count: pending.count} : null;
    chatFor(main).update(state, {...local, busy, outgoing});
  } else {
    if (chat) { chat.destroy(); chat = null; }
    main.innerHTML = view === 'deductions' ? views.renderDeductions(state) : view === 'casefile' ? views.renderCaseFile(state) : RENDER[screen](state, local);
    for (const [id, value] of Object.entries(entryValues)) { const el = document.getElementById(id); if (el && el.type !== 'hidden') el.value = value; }
    main.scrollTop = keepScroll;
    if (focusId) { const el = document.getElementById(focusId); el?.focus({preventScroll: true}); try { if (caret?.[0] != null) el.setSelectionRange(...caret); } catch {} }
  }
  setScene(screen);
  playTransition(screen);
  setBusy();
}

// The transition moves on by itself unless the player prefers reduced motion; then it waits for Continue.
function playTransition(screen) {
  const key = screen === 'transition' ? JSON.stringify([state.code, state.me.id, views.stageOf(state)]) : null;
  if (key === transition.key) return;
  clearTimeout(transition.timer);
  transition = {key, timer: null};
  if (!key) return;
  $('#announcer').textContent = [...$('#main').querySelectorAll('.transition .title, .transition .time, .transition .sub')].map(el => el.textContent).join('. ');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) transition.timer = setTimeout(() => { if (transition.key === key) actions.continue(); }, views.TRANSITION_MS);
}
function setBusy() {
  document.body.classList.toggle('busy', busy);
  for (const b of document.querySelectorAll('[data-submit]')) b.disabled = busy || !!pending || b.dataset.locked === 'true';
}

function applyState(next) {
  if (!next || (session && (next.code !== session.code || next.me?.id !== session.playerId))) return false;
  if (state && next.code === state.code && next.version < lastVersion) return false;
  const moved = !state || state.round !== next.round || state.phase !== next.phase;
  // Toasts only for deductions unlocked while watching: never on first load or reload.
  const fresh = freshDeductions(state, next);
  state = next; lastVersion = next.version;
  if (moved) { local.selected = null; local.tab = 'investigate'; closeConfirmation(); }
  if (fresh.length) showUnlocked(fresh);
  render();
  return true;
}

// Every network write goes through here: one at a time, persisted so a reload can retry it with the same id.
async function run(work) {
  if (busy || (pending && pending !== work)) return false;
  pending = work; store.set(PENDING, work); busy = true; render();
  try {
    if (work.entry) {
      const {data} = await fetchJson(work.path, {body: work.body});
      session = {code: data.code, playerId: data.playerId}; store.set(SESSION, session);
      history.replaceState(null, '', location.pathname);
      pending = null; store.remove(PENDING); busy = false; clearNotice();
      applyState(data.state);
    } else {
      const next = await command(work.code, work.action);
      pending = null; store.remove(PENDING); busy = false; clearNotice();
      if (work.action.type === 'ask') ui.clearMatchingDraft(work.context, work.action.question);
      applyState(next);
    }
    return true;
  } catch (error) {
    busy = false;
    // A room from a retired case version never comes back: leave it instead of retrying forever.
    if (error.status === 503 && roomGone(error)) {
      if (work.entry) { pending = null; store.remove(PENDING); notice(ROOM_EXPIRED, true); }
      else { resetSession(); notice(ROOM_EXPIRED, true); }
    } else if (error.status && error.status < 500 && error.status !== 429) { pending = null; store.remove(PENDING); notice(error.message, true); }
    else notice(error.status === 429 ? error.message : 'Connection lost. Your action may have arrived. Retry safely: it will not be sent twice.', true);
    render();
    return false;
  }
}
function act(type, data = {}, extra = {}) {
  const action = {type, ...data};
  return run({...extra, code: session.code, context: uiContext(state), action: {...action, id: requestIdFor(action)}});
}

function openConfirmation({title, body, label, onConfirm}) {
  confirmation = {onConfirm, round: state.round, phase: state.phase};
  $('#confirm-title').textContent = title;
  $('#confirm-body').innerHTML = body;
  $('#confirm-accept').textContent = label;
  $('#confirm-dialog').showModal();
  $('#confirm-cancel').focus();
}
function closeConfirmation() { confirmation = null; if ($('#confirm-dialog').open) $('#confirm-dialog').close(); }
async function confirmAction() {
  const chosen = confirmation;
  closeConfirmation();
  if (!chosen) return;
  if (chosen.round !== state?.round || chosen.phase !== state?.phase) { notice('The turn moved on. Check your choice again.', true); return; }
  await chosen.onConfirm();
}

function inviteLink() { const url = new URL(location.pathname, location.origin); url.hash = 'join=' + state.code; return url.href; }
async function copy(text, done, fallback) {
  try { await navigator.clipboard.writeText(text); notice(done); } catch { notice(fallback); }
}

function resetSession() {
  if (state) ui.forget(state.code, state.me.id); else if (session) ui.forget(session.code, session.playerId);
  closeConfirmation();
  session = null; state = null; pending = null; lastVersion = -1;
  Object.assign(local, {briefingSeen: false, lastSeenRound: 0, tab: 'investigate', selected: null, draft: '', reading: null, entry: 'create', invite: ''});
  store.remove(SESSION); store.remove(PENDING);
  history.replaceState(null, '', location.pathname);
  render();
}

const actions = {
  retry: () => pending && run(pending),
  reset: () => resetSession(),
  'copy-code': () => copy(state.code, 'Room code copied.', `Room code: ${state.code}`),
  'copy-invite': () => copy(inviteLink(), 'Invite link copied. Send it to the table.', `Invite link: ${inviteLink()}`),
  begin: () => { ui.markSeen(state.code, state.me.id, {briefingSeen: true, lastSeenRound: state.round}); render(); },
  // Also run by the transition timer: focus lands on the new screen, as after leaving a chat.
  continue: () => { ui.markSeen(state.code, state.me.id, {lastSeenRound: views.stageOf(state)}); render(); $('#main').focus({preventScroll: true}); },
  'leave-chat': () => { local.reading = null; render(); $('#main').focus({preventScroll: true}); },
  start: () => act('start'),
  question: () => local.selected && act('select', {suspectId: local.selected, round: state.round}),
  summon: () => {
    const s = state.suspects.find(x => x.id === local.selected);
    if (!s || state.me.vote) return;
    openConfirmation({...views.summonConfirmation(s), onConfirm: () => act('vote', {suspectId: s.id})});
  },
  advance: () => state.me.host && openConfirmation({...views.ADVANCE_CONFIRM,
    onConfirm: () => act('advance', {round: state.round, confirmed: true})}),
  claimHost: () => state.hostRecoverable && openConfirmation({title: 'Take over as host?', label: 'Take over',
    body: '<p>The host has been out of contact for two minutes. They stay in the game and keep their conversations.</p>',
    onConfirm: () => act('claimHost', {confirmed: true})}),
  finalizeAccusations: () => state.canFinalizeAccusations && openConfirmation({title: 'Reveal without them?', label: 'Reveal now',
    body: `<p>${state.players.filter(p => !p.voteSubmitted).length} agent(s) have not summoned anyone and have been away for two minutes. They count as abstentions.</p><p><b>This cannot be undone.</b></p>`,
    onConfirm: () => act('finalizeAccusations', {confirmed: true})}),
};

document.addEventListener('click', event => {
  const b = event.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.entry) { local.entry = b.dataset.entry; render(); return; }
  if (b.dataset.tab) { local.tab = b.dataset.tab; render(); $('#main').scrollTop = 0; return; }
  if (b.dataset.suspect) { local.selected = local.selected === b.dataset.suspect ? null : b.dataset.suspect; render(); return; }
  const action = actions[b.dataset.action];
  if (action && (!busy || b.dataset.action === 'reset')) action();
});
document.addEventListener('submit', event => {
  event.preventDefault();
  if (busy || pending) return;
  const form = event.target, data = Object.fromEntries(new FormData(form));
  if (form.id === 'create-form') run({entry: true, path: '/api/rooms', body: {name: data.name, caseId: data.caseId, requestId: newRequestId()}});
  if (form.id === 'join-form') run({entry: true, path: `/api/rooms/${encodeURIComponent(data.code.trim().toUpperCase())}/join`, body: {name: data.name, requestId: newRequestId()}});
});
$('#confirm-cancel').addEventListener('click', () => closeConfirmation());
$('#confirm-accept').addEventListener('click', () => confirmAction());
$('#confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); closeConfirmation(); });
window.addEventListener('hashchange', () => {
  const code = invitationCode(location.hash);
  if (code && !session && !state) { Object.assign(local, {entry: 'join', invite: code}); render(); $('#join-name')?.focus(); }
});

function pollFailed(error) {
  const gone = roomGone(error);
  if (gone) {
    resetSession();
    notice(gone === 'expired' ? ROOM_EXPIRED : 'Your place in the room could not be restored. Join a new case.', true);
  } else notice('Connection interrupted. Reconnecting…', true);
}
const poller = pollLoop({
  getState: () => (!session || busy || pending ? null : state ?? {code: session.code, version: -1}),
  onState: next => { if (!busy && !pending && applyState(next) && $('#notice').textContent.startsWith('Connection interrupted')) clearNotice(); },
  onError: error => { if (!busy && !pending && session) pollFailed(error); },
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) poller.now(); });
// Heartbeat lets the server tell an absent host or voter from one who is still at the table.
setInterval(async () => {
  if (!session || !state || state.phase === 'reveal' || busy || pending || document.hidden || Date.now() - lastHeartbeat < 30000) return;
  lastHeartbeat = Date.now();
  try { const beat = await command(session.code, {type: 'heartbeat'}); if (!busy && !pending && beat?.version > lastVersion) applyState(beat); } catch {}
}, 5000);

render();
try {
  await fetchJson('/api/session', {body: {}});
  local.cases = (await fetchJson('/api/cases')).data.cases;
  render();
  if (local.invite) $('#join-name')?.focus();
  if (pending) await run(pending);
  else if (session) poller.now();
} catch { notice('The server is unavailable. Reload when your connection returns.', true); }
