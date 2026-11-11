// Pure views: (state, local) => HTML string. No DOM access, every value escaped.
// `local` is client-only: {briefingSeen, lastSeenRound, tab, selected, draft}, plus for the
// landing screen {entry:'create'|'join', cases, invite} and {busy} while a command is in flight.
import {topicLabels} from './question-topics.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const AI_NOTICE = "Suspects are voiced by AI. Don't type personal information.";
const PORTRAITS = new Set(['mara', 'ines', 'bento', 'celia', 'noa', 'rui', 'vera', 'davi', 'lia', 'tomas', 'helena', 'joel', 'olga', 'samira', 'elio']);
const firstName = name => String(name ?? '').trim().split(/\s+/)[0] || 'them';
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : '#4a5a6a';
const suspect = (state, id) => state.suspects.find(s => s.id === id);
const playerName = (state, id) => state.players.find(p => p.id === id)?.name ?? 'An agent';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const maxQuestions = state => state.config?.maxQuestions ?? 3;
const rounds = state => state.config?.rounds ?? 4;
const pendingLast = interview => interview?.messages?.at(-1)?.status === 'pending';
const myPending = state => state.me.interviews.some(pendingLast);

const icon = {
  investigate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  deductions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
  case: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
};

// A portrait only for the shipped allowlist; every other id gets a large initials tile.
function face(s, className = 'face') {
  if (PORTRAITS.has(s?.id)) return `<img class="${className}" src="/assets/portraits/${s.id}.webp" alt="" width="512" height="512" loading="lazy" decoding="async">`;
  const initials = s?.initials || String(s?.name ?? '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  return `<span class="tile" style="--tile:${safeColor(s?.color)}" aria-hidden="true">${esc(initials)}</span>`;
}

// The interview the player is looking at. After the turn moves on, a previous-turn
// interview whose reply is still pending stays on screen until that reply lands.
export function currentInterview(state, local) {
  const interviews = state?.me?.interviews ?? [];
  if (state?.phase === 'investigation' && state.round > (local?.lastSeenRound ?? 0)) {
    const held = interviews.find(i => i.round < state.round && pendingLast(i));
    if (held) return held;
  }
  return interviews.find(i => i.round === state?.round) ?? null;
}

export function screenFor(state, local) {
  if (!state) return 'landing';
  if (state.phase === 'lobby') return 'lobby';
  if (state.phase === 'accusation') return 'accuse';
  if (state.phase === 'reveal') return 'reveal';
  if (!local.briefingSeen) return 'briefing';
  if (state.round > local.lastSeenRound && !myPending(state)) return 'transition';
  const interview = currentInterview(state, local);
  if (!interview) return 'pick';
  if (!interview.closed || pendingLast(interview)) return 'chat';
  return 'waiting';
}

export function renderHeader(state, local) {
  if (!state) return '';
  let clock;
  if (state.phase === 'lobby') clock = `Room ${esc(state.code)}`;
  else if (state.phase === 'investigation') clock = `Turn ${state.round} of ${rounds(state)} · ${esc(state.clock?.time)} · ${state.clock?.hoursLeft}h left`;
  else if (state.phase === 'accusation') clock = `The summons · crime at ${esc(state.clock?.crimeAt)}`;
  else clock = 'Timeline closed';
  const steps = state.phase === 'investigation' || state.phase === 'accusation'
    ? `<div class="steps" aria-hidden="true">${Array.from({length: rounds(state)}, (_, i) => `<span class="${state.phase === 'accusation' || i < state.round ? 'on' : ''}"></span>`).join('')}</div>` : '';
  return `<div class="top"><span class="case-title">${esc(state.case.title)}</span><span class="clock">${clock}</span></div>${steps}`;
}

export function renderTabBar(state, local) {
  if (!state || !['investigation', 'accusation'].includes(state.phase)) return '';
  if (['briefing', 'transition'].includes(screenFor(state, local))) return '';
  const tab = local.tab ?? 'investigate', count = state.me.deductions.length;
  const item = (id, label, extra = '') => `<button type="button" class="tab" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>${icon[id]}<span>${label}${extra}</span></button>`;
  return `<nav class="tabbar" aria-label="Game sections">${item('investigate', state.phase === 'accusation' ? 'Summon' : 'Investigate')}${item('deductions', 'Deductions', ` <small>${count}/${state.deductionTotal}</small>`)}${item('case', 'Case file')}</nav>`;
}

export function renderLanding(state, local) {
  const entry = local.entry === 'join' ? 'join' : 'create', cases = (local.cases ?? []).filter(c => c.available);
  const caseField = cases.length > 1
    ? `<label for="case-choice">Case</label><select id="case-choice" name="caseId">${cases.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</select>`
    : `<input type="hidden" name="caseId" value="${esc(cases[0]?.id)}">`;
  const nameField = id => `<label for="${id}">Your codename</label><input id="${id}" name="name" required maxlength="24" autocomplete="nickname" placeholder="What should the table call you?">`;
  const form = entry === 'create'
    ? `<form id="create-form" class="entry">${nameField('create-name')}${caseField}<button class="btn" data-submit ${cases.length ? '' : 'disabled data-locked="true"'}>Open the case →</button></form>`
    : `<form id="join-form" class="entry">${nameField('join-name')}<label for="join-code">Room code</label><input id="join-code" name="code" value="${esc(local.invite)}" required minlength="8" maxlength="8" pattern="[A-HJ-NP-Za-hj-np-z2-9]{8}" placeholder="ABCD2345" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btn" data-submit>Join the table →</button></form>`;
  return `<section class="screen landing">
<div class="brand"><h1 class="wordmark">SHIFT</h1><p class="tagline">The Timeline</p></div>
<p class="lead">A crime foretold. Someone dies in 24 hours.<br>Find the killer before it happens.</p>
<div class="segmented" role="group" aria-label="Room options"><button type="button" data-entry="create" aria-pressed="${entry === 'create'}">New room</button><button type="button" data-entry="join" aria-pressed="${entry === 'join'}">Join with a code</button></div>
${form}
<p class="ai-notice">${esc(AI_NOTICE)}</p>
</section>`;
}

export function renderLobby(state, local) {
  const n = state.players.length, min = state.config?.minPlayers ?? 3, max = state.config?.maxPlayers ?? 4;
  const roster = state.players.map(p => `<li><span class="mark" aria-hidden="true">${esc(firstName(p.name).slice(0, 1))}</span><b>${esc(p.name)}${p.id === state.me.id ? ' <small>(you)</small>' : ''}</b><span class="role">${p.host ? 'Host' : 'Agent'}</span></li>`).join('');
  const start = state.me.host
    ? `<button class="btn" data-action="start" data-submit ${n < min ? 'disabled data-locked="true"' : ''}>${n < min ? `Need ${plural(min - n, 'more agent')}` : 'Start the investigation →'}</button>`
    : '<p class="hint">The host starts the investigation when the table is ready.</p>';
  return `<section class="screen lobby">
<h1 class="title">Gather the table.</h1>
<p class="sub">Everyone plays on their own phone. Send the link, or read the code out loud.</p>
<div class="room"><span class="room-code" aria-label="Room code ${esc(state.code.split('').join(' '))}">${esc(state.code)}</span><div class="row"><button type="button" class="btn" data-action="copy-invite">Copy invite link</button><button type="button" class="btn ghost" data-action="copy-code">Copy code</button></div></div>
<h2 class="label">Agents · ${n} of ${max}</h2>
<ul class="roster">${roster}</ul>
<div class="cta">${start}<p class="ai-notice">${esc(AI_NOTICE)}</p></div>
</section>`;
}

export function renderBriefing(state, local) {
  const r = rounds(state), q = maxQuestions(state), hours = state.config?.hoursPerRound ?? 6;
  return `<section class="screen briefing">
<p class="eyebrow">A crime foretold</p>
<blockquote class="prediction">${esc(state.case.prediction)}</blockquote>
<p class="lead">You investigate crimes that have not happened yet. Find the killer and summon them before ${esc(state.clock?.crimeAt)} tomorrow.</p>
<ol class="rules">
<li><b>${r * hours} hours</b> · ${r} turns of ${hours} hours.</li>
<li>Each turn, question one suspect: <b>${q} questions</b> each.</li>
<li><b>Deductions unlock</b> as you talk. Share them out loud.</li>
<li>At the end, <b>summon the killer</b>. Your choice is final.</li>
</ol>
<div class="cta"><button type="button" class="btn" data-action="begin">Begin</button></div>
</section>`;
}

export function renderTransition(state, local) {
  const hours = state.config?.hoursPerRound ?? 6;
  return `<section class="screen transition" aria-labelledby="transition-title">
<p class="eyebrow">Turn ${state.round} of ${rounds(state)}</p>
<h1 id="transition-title" class="title">${hours} hours later</h1>
<p class="time">${esc(state.clock?.time)}</p>
<p class="sub">${state.clock?.hoursLeft} hours until the crime.</p>
<div class="cta"><button type="button" class="btn ghost" data-action="continue">Continue</button></div>
</section>`;
}

function suspectGrid(state, local, {taken = new Map(), asked = new Map()} = {}) {
  return `<div class="grid" role="group" aria-label="Suspects">${state.suspects.map(s => {
    const selected = local.selected === s.id, notes = [asked.get(s.id), taken.get(s.id)].filter(Boolean);
    return `<button type="button" class="card" data-suspect="${esc(s.id)}" aria-pressed="${selected}">${face(s)}<span class="n">${esc(s.name)}<small>${esc(s.role)}</small></span>${notes.length ? `<span class="badge">${esc(notes.join(' · '))}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

export function renderPick(state, local) {
  const chosen = suspect(state, local.selected), q = maxQuestions(state);
  const taken = new Map(), asked = new Map();
  for (const p of state.players) if (p.id !== state.me.id && p.selectedSuspectId) taken.set(p.selectedSuspectId, [taken.get(p.selectedSuspectId), firstName(p.name)].filter(Boolean).join(', '));
  for (const i of state.me.interviews) if (i.round < state.round) asked.set(i.suspectId, `Turn ${i.round}`);
  return `<section class="screen pick">
<h1 class="title">Who will you question?</h1>
<p class="sub">Pick one suspect for this turn. Only you will see the conversation.</p>
${suspectGrid(state, local, {taken, asked})}
<div class="cta"><button type="button" class="btn" data-action="question" data-submit ${chosen ? '' : 'disabled data-locked="true"'}>${chosen ? `Question ${esc(firstName(chosen.name))} →` : 'Choose a suspect'}</button><p class="hint">You get ${q} questions.</p></div>
</section>`;
}

export function renderChat(state, local) {
  const interview = currentInterview(state, local), s = suspect(state, interview.suspectId), q = maxQuestions(state);
  const asked = interview.messages.length, pending = pendingLast(interview);
  const bubbles = interview.messages.map(m => `<li class="b me">${esc(m.question)}</li>${m.status === 'pending'
    ? `<li class="typing" role="img" aria-label="${esc(firstName(s?.name))} is replying"><i></i><i></i><i></i></li>`
    : `<li class="b them">${esc(m.reply)}</li>`}`).join('');
  const footer = interview.closed && !pending
    ? `<p class="done">That's all your questions for this turn.</p>`
    : `<div class="chips" role="group" aria-label="Suggested questions">${Object.values(topicLabels).map(label => `<button type="button" class="chip" data-chip="${esc(label)}" ${pending || interview.closed ? 'disabled' : ''}>${esc(label)}</button>`).join('')}</div>
<form id="question-form" class="composer"><label class="visually-hidden" for="question">Your question</label><textarea id="question" name="question" rows="1" maxlength="500" placeholder="Ask ${esc(firstName(s?.name))} anything…" enterkeyhint="send" ${interview.closed ? 'disabled' : ''}>${esc(local.draft)}</textarea><button class="send" data-submit aria-label="Send question" ${pending || interview.closed ? 'disabled data-locked="true"' : ''}>↑</button></form>`;
  return `<section class="screen chat">
<div class="chead">${face(s, 'avatar')}<div class="who"><b>${esc(s?.name)}</b><small>${esc(s?.role)}</small></div><div class="count" aria-label="${asked} of ${q} questions asked"><div class="dots" aria-hidden="true">${Array.from({length: q}, (_, i) => `<i class="${i < asked ? 'u' : ''}"></i>`).join('')}</div>${asked} of ${q}</div></div>
<ol id="transcript" class="msgs"><li class="sys">Turn ${interview.round} · only you can see this conversation</li>${interview.opening ? `<li class="b them">${esc(interview.opening)}</li>` : ''}${bubbles}</ol>
${footer}
</section>`;
}

const waitingFor = (state, done) => state.players.filter(p => p.id !== state.me.id && !done(p)).map(p => p.name);

export function renderWaiting(state, local) {
  const waiting = waitingFor(state, p => p.ready), count = state.me.deductions.length;
  return `<section class="screen waiting">
<p class="eyebrow">Turn ${state.round} of ${rounds(state)} · ${esc(state.clock?.time)}</p>
<h1 class="title">Your turn is done.</h1>
<p class="sub">${waiting.length ? `Waiting for: ${esc(waiting.join(', '))}` : 'Everyone has finished. The clock is moving…'}</p>
<p class="hint">Tell the table what you found while you wait.</p>
<div class="cta">
<button type="button" class="btn ghost" data-tab="deductions">Review your deductions (${count})</button>
${state.me.host ? '<button type="button" class="btn danger" data-action="advance" data-submit>Advance now</button><p class="hint">Anyone still talking loses their remaining questions.</p>' : ''}
${state.hostRecoverable && !state.me.host ? '<button type="button" class="btn ghost" data-action="claimHost" data-submit>Take over as host</button>' : ''}
</div>
</section>`;
}

export function renderAccuse(state, local) {
  if (state.me.vote) {
    const waiting = waitingFor(state, p => p.voteSubmitted);
    return `<section class="screen accuse sealed">
<p class="eyebrow">The summons</p>
<h1 class="title">Your summons is sealed.</h1>
<div class="sealed-card">${face(suspect(state, state.me.vote))}<b>${esc(suspect(state, state.me.vote)?.name)}</b></div>
<p class="sub">${waiting.length ? `Waiting for: ${esc(waiting.join(', '))}` : 'Everyone has chosen. The timeline is turning…'}</p>
${state.me.host && state.canFinalizeAccusations ? '<div class="cta"><button type="button" class="btn danger" data-action="finalizeAccusations" data-submit>Reveal without them</button></div>' : ''}
${state.hostRecoverable && !state.me.host ? '<div class="cta"><button type="button" class="btn ghost" data-action="claimHost" data-submit>Take over as host</button></div>' : ''}
</section>`;
  }
  const chosen = suspect(state, local.selected);
  return `<section class="screen accuse">
<h1 class="title">Who is the killer?</h1>
<p class="sub">Summon one suspect, on your own. Talk it over first.</p>
${suspectGrid(state, local)}
<div class="cta"><button type="button" class="btn" data-action="summon" data-submit ${chosen ? '' : 'disabled data-locked="true"'}>${chosen ? `Summon ${esc(firstName(chosen.name))} →` : 'Choose a suspect'}</button><p class="hint">This cannot be undone.</p></div>
</section>`;
}

const OUTCOMES = {complete: 'The timeline shifts.', partial: 'The timeline wavers.', defeat: 'The timeline holds.'};
export function renderReveal(state, local) {
  const r = state.result, culprit = suspect(state, r.culpritId);
  const votes = r.votes.map(v => `<li class="${v.correct ? 'hit' : 'miss'}"><b>${esc(playerName(state, v.playerId))}${v.playerId === state.me.id ? ' <small>(you)</small>' : ''}</b><span>${v.suspectId ? esc(suspect(state, v.suspectId)?.name) : 'No summons'}</span><span class="mark" aria-label="${v.correct ? 'Correct' : 'Wrong'}">${v.correct ? '✓' : '✗'}</span></li>`).join('');
  return `<section class="screen reveal">
<p class="eyebrow">The truth</p>
<h1 class="title">${OUTCOMES[r.outcome] ?? 'The timeline is revealed.'}</h1>
<p class="sub">${r.correct} of ${r.total} summoned the killer.</p>
<div class="culprit">${face(culprit)}<div><small>The killer</small><b>${esc(culprit?.name)}</b><span>${esc(culprit?.role)}</span></div></div>
<ul class="votes">${votes}</ul>
${r.solution?.motive ? `<h2 class="label">Why</h2><p class="solution">${esc(r.solution.motive)}</p>` : ''}
${r.solution?.plan ? `<h2 class="label">How</h2><p class="solution">${esc(r.solution.plan)}</p>` : ''}
<div class="cta"><button type="button" class="btn ghost" data-action="reset">New investigation</button></div>
</section>`;
}

export function renderDeductions(state) {
  const unlocked = state.me.deductions, total = Math.max(state.deductionTotal ?? 0, unlocked.length);
  const items = unlocked.map(d => `<li class="unlocked"><p>${esc(d.text)}</p><small>From ${esc(firstName(suspect(state, d.suspectId)?.name))} · Turn ${esc(d.round)}</small></li>`).join('')
    + Array.from({length: total - unlocked.length}, () => `<li class="locked" aria-label="Locked deduction">${icon.lock}</li>`).join('');
  return `<section class="screen deductions">
<h1 class="title">Deductions</h1>
<p class="sub">${unlocked.length} of ${total} unlocked</p>
${unlocked.length ? '' : '<p class="hint">They unlock as you talk to the suspects.</p>'}
<ol class="dlist">${items}</ol>
</section>`;
}

export function renderCaseFile(state) {
  const c = state.case;
  return `<section class="screen casefile">
<h1 class="title">Case file</h1>
<blockquote class="prediction">${esc(c.prediction)}</blockquote>
<dl class="facts"><dt>Victim</dt><dd>${esc(c.victim)}</dd><dt>Place</dt><dd>${esc(c.place)}</dd><dt>Method</dt><dd>${esc(c.method)}</dd><dt>The crime</dt><dd>${esc(state.clock?.crimeAt)}, tomorrow</dd></dl>
<h2 class="label">Room</h2>
<p class="room-line"><span class="room-code small">${esc(state.code)}</span><button type="button" class="btn ghost small" data-action="copy-invite">Copy invite link</button></p>
${state.hostRecoverable && !state.me.host ? '<p class="hint">The host has been away for two minutes.</p><button type="button" class="btn ghost" data-action="claimHost" data-submit>Take over as host</button>' : ''}
</section>`;
}
