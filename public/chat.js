// Messenger-style interrogation. The composer is built once per interview and survives
// every poll: only the header and the transcript are refreshed, so focus, caret and
// draft are never lost. The network stays in app.js, behind onSend.
import * as views from './views.js';

const NEAR_BOTTOM = 48, MAX_FIELD = 120;

export function mountChat(root, {onSend, draft = '', onDraft = () => {}}) {
  const doc = root.ownerDocument, win = doc.defaultView, viewport = win?.visualViewport;
  let state = null, local = {}, refs = null, ended = false, head = '', html = '', announced = null, stick = true;
  // The question this chat just sent, shown until the server's copy arrives. `count` is the
  // number of messages before it, so a repeated question is never mistaken for the new one.
  let sending = null;

  const interview = () => views.currentInterview(state, local);
  const suspectName = () => state.suspects.find(s => s.id === interview()?.suspectId)?.name;
  const optimistic = () => {
    const messages = interview()?.messages ?? [];
    if (sending && messages.length <= sending.count) return sending.text;
    // A send the app still holds for a safe retry (lost response or reload).
    if (local.outgoing && messages.at(-1)?.question !== local.outgoing) return local.outgoing;
    return null;
  };
  const hold = () => { const i = interview(); return !i || i.closed || i.messages.at(-1)?.status === 'pending' || !!local.busy || !!optimistic(); };

  function scrollToEnd() { if (refs) { refs.transcript.scrollTop = refs.transcript.scrollHeight; stick = true; } }
  function fit() {
    const field = refs?.field;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_FIELD)}px`;
  }
  function syncControls() {
    if (!refs?.field) return;
    refs.send.disabled = hold() || !refs.field.value.trim();
    for (const chip of refs.chips) chip.disabled = hold();
  }
  function announce(text) {
    const el = doc.getElementById('announcer');
    if (el) el.textContent = text;
  }

  function build() {
    root.innerHTML = views.renderChat(state, {...local, draft});
    refs = {head: root.querySelector('.chead'), transcript: root.querySelector('#transcript'), foot: root.querySelector('.cfoot'),
      field: root.querySelector('#question'), send: root.querySelector('.send'), chips: root.querySelectorAll('.chip')};
    refs.transcript.addEventListener('scroll', () => {
      const t = refs.transcript;
      stick = t.scrollHeight - t.scrollTop - t.clientHeight < NEAR_BOTTOM;
    });
    ended = !refs.field;
    head = views.renderChatHead(state, local);
    html = views.renderTranscript(state, local);
    refresh();
    fit();
    scrollToEnd();
  }

  function refresh() {
    const i = interview();
    if (!i || !refs) return;
    const nextHead = views.renderChatHead(state, local);
    if (nextHead !== head) refs.head.innerHTML = head = nextHead;
    const extra = optimistic(), typing = `<li class="typing" role="img" aria-label="${views.esc(views.typingLabel(suspectName()))}"><i></i><i></i><i></i></li>`;
    const next = views.renderTranscript(state, local) + (extra ? `<li class="b me">${views.esc(extra)}</li>${typing}` : '');
    // Every reply that lands while the chat is open is announced exactly once.
    const replied = i.messages.filter(m => m.status !== 'pending');
    let arrived = false;
    if (!announced) announced = new Set(replied.map(m => m.id));
    for (const m of replied) if (!announced.has(m.id)) { announced.add(m.id); arrived = true; announce(`${views.firstName(suspectName())}: ${m.reply}`); }
    if (next !== html) {
      html = next;
      refs.transcript.innerHTML = next;
      if (stick || arrived) scrollToEnd();
    }
    if (!ended && views.chatEnded(state, local)) {
      ended = true;
      refs.foot.innerHTML = views.CHAT_DONE;
      Object.assign(refs, {field: null, send: null, chips: []});
    }
    syncControls();
  }

  function send(raw) {
    const text = String(raw ?? '').trim();
    if (!text || !refs?.field || hold()) return;
    sending = {text, count: interview().messages.length};
    refs.field.value = '';
    onDraft('');
    fit();
    stick = true;
    refresh();
    scrollToEnd();
    refs.field.focus({preventScroll: true});
    const settle = ok => {
      if (sending?.text !== text) return;
      sending = null;
      // A question the server refused goes back into the field, unless the app still holds it for a
      // safe retry or the player has already typed something else.
      if (!ok && local.outgoing !== text && refs?.field && !refs.field.value) { refs.field.value = text; onDraft(text); fit(); }
      refresh();
    };
    let result;
    try { result = onSend(text); } catch { result = false; }
    Promise.resolve(result).then(settle, () => settle(false));
  }

  const listeners = {
    keydown(event) {
      if (event.target.id !== 'question' || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      send(refs?.field?.value);
    },
    input(event) {
      if (event.target.id !== 'question') return;
      onDraft(event.target.value);
      fit();
      syncControls();
    },
    // A tap anywhere in the composer area (Send, a chip, or a disabled one, which CSS lets fall
    // through to its container) must not take focus from the field: the phone keyboard would close.
    mousedown(event) { if (refs?.field && event.target.closest?.('.cfoot') && event.target.id !== 'question') event.preventDefault(); },
    click(event) {
      const button = event.target.closest?.('button');
      if (!button || button.disabled || !refs?.field) return;
      if (button.classList.contains('send')) send(refs.field.value);
      else if (button.dataset.chip) { refs.field.value = button.dataset.chip; send(button.dataset.chip); }
    },
    submit(event) { event.preventDefault(); send(refs?.field?.value); },
  };
  for (const [type, fn] of Object.entries(listeners)) root.addEventListener(type, fn);

  // On iOS the keyboard shrinks only the visual viewport: --kb lifts the app above it.
  // Android (interactive-widget=resizes-content) resizes the layout instead, and the inset stays 0.
  function onViewport() {
    const inset = Math.max(0, Math.round(win.innerHeight - viewport.height - viewport.offsetTop));
    doc.documentElement.style.setProperty('--kb', `${inset}px`);
    doc.documentElement.classList.toggle('kb-open', inset > 0);
    if (stick) scrollToEnd();
  }
  if (viewport) for (const type of ['resize', 'scroll']) viewport.addEventListener(type, onViewport);

  return {
    update(next, nextLocal = {}) {
      state = next;
      local = nextLocal;
      if (!interview()) return;
      if (refs) refresh(); else build();
    },
    destroy() {
      for (const [type, fn] of Object.entries(listeners)) root.removeEventListener(type, fn);
      if (viewport) for (const type of ['resize', 'scroll']) viewport.removeEventListener(type, onViewport);
      doc.documentElement.style.removeProperty('--kb');
      doc.documentElement.classList.remove('kb-open');
      refs = null;
    },
  };
}
