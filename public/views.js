// Pure views: (state, local) => HTML string. No DOM access, every value escaped.
// `local` is client-only: {briefingSeen, lastSeenRound, tab, selected, draft, reading}, plus for the
// landing screen {entry:'create'|'join', cases, invite} and {busy} while a command is in flight.
import {casePrediction} from './case-presentation.js';
import {topicLabels} from './question-topics.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const AI_NOTICE = "Suspects are voiced by AI. Don't type personal information.";
export const dialogueNotice = mode => mode === 'ai' ? `${AI_NOTICE} Authored replies take over if AI is unavailable.`
  : mode === 'canonical' ? 'Suspects use authored replies. Questions match a topic, so rephrasing may repeat an answer.'
    : 'Interview mode is loading. Please avoid personal information in your questions.';
const PORTRAITS = new Set(['mara', 'ines', 'bento', 'celia', 'noa', 'rui', 'vera', 'davi', 'lia', 'tomas', 'helena', 'joel', 'olga', 'samira', 'elio']);
// The public museum demo uses a different cast. Reuse the shipped fictional art
// only for that case; never infer asset paths from arbitrary case data.
const PUBLIC_DEMO_PORTRAITS = new Map(Object.entries({
  ada: 'lia', basil: 'davi', cora: 'celia', dev: 'joel', rowan: 'tomas',
  leena: 'helena', kit: 'noa', priya: 'ines', oscar: 'bento', gia: 'samira',
  hugo: 'rui', nell: 'mara', milo: 'elio', tess: 'olga', wren: 'vera',
}));
export const firstName = name => String(name ?? '').trim().split(/\s+/)[0] || 'them';
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : '#4a5a6a';
const suspect = (state, id) => state.suspects.find(s => s.id === id);
const playerName = (state, id) => state.players.find(p => p.id === id)?.name ?? 'An agent';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const maxQuestions = state => state.config?.maxQuestions ?? 3;
const rounds = state => state.config?.rounds ?? 4;
const pendingLast = interview => interview?.messages?.at(-1)?.status === 'pending';

const icon = {
  investigate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  deductions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
  case: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
};

// A portrait only for the shipped allowlist; every other id gets a large initials tile.
function face(state, s, className = 'face') {
  const portraitId = state.case?.id === 'bracken-quay-demo' ? PUBLIC_DEMO_PORTRAITS.get(s?.id) : s?.id;
  if (PORTRAITS.has(portraitId)) return `<img class="${className}" src="/assets/portraits/${portraitId}.webp" alt="" width="512" height="512" loading="lazy" decoding="async">`;
  const initials = s?.initials || String(s?.name ?? '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  return `<span class="tile" style="--tile:${safeColor(s?.color)}" aria-hidden="true">${esc(initials)}</span>`;
}

// Where the player stands on the timeline: the turn, or one past the last turn once the summons begins.
// `local.lastSeenRound` records the last stage whose transition the player has seen.
export const stageOf = state => state?.phase === 'investigation' ? state.round : rounds(state) + 1;

// After the turn moves on, the previous-turn chat stays on screen while its last reply is
// pending or the player is still reading it; the transition waits until they move on.
function heldInterview(state, local) {
  if (!['investigation', 'accusation'].includes(state?.phase) || stageOf(state) <= (local?.lastSeenRound ?? 0)) return null;
  return state.me.interviews.find(i => i.round < stageOf(state) && (pendingLast(i) || local?.reading === chatKey(i))) ?? null;
}

// The interview the player is looking at: a held previous-turn chat, else this turn's.
export function currentInterview(state, local) {
  const held = heldInterview(state, local);
  if (held || state?.phase !== 'investigation') return held;
  return state.me.interviews.find(i => i.round === state.round) ?? null;
}

export function screenFor(state, local) {
  if (!state) return 'landing';
  if (state.phase === 'lobby') return 'lobby';
  if (state.phase === 'reveal') return 'reveal';
  if (state.phase === 'investigation' && !local.briefingSeen) return 'briefing';
  if (heldInterview(state, local)) return 'chat';
  if (stageOf(state) > (local.lastSeenRound ?? 0)) return 'transition';
  if (state.phase === 'accusation') return 'accuse';
  const interview = currentInterview(state, local);
  if (!interview) return 'pick';
  // A player who watched the last reply arrive keeps reading it until they choose to move on.
  if (!interview.closed || pendingLast(interview) || local.reading === chatKey(interview)) return 'chat';
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
  if (!state || !['investigation', 'accusation', 'reveal'].includes(state.phase)) return '';
  if (screenFor(state, local) === 'briefing' || (screenFor(state, local) === 'transition' && local.tab !== 'deductions')) return '';
  const tab = local.tab ?? 'investigate', count = state.me.deductions.length;
  const item = (id, label, extra = '') => `<button type="button" class="tab" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>${icon[id]}<span>${label}${extra}</span></button>`;
  return `<nav class="tabbar" aria-label="Game sections">${item('investigate', state.phase === 'reveal' ? 'Outcome' : state.phase === 'accusation' ? 'Summon' : 'Investigate')}${item('deductions', 'Deductions', ` <small>${count}/${state.deductionTotal}</small>`)}${item('case', 'Case file')}</nav>`;
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
<p class="table-guide">3–4 players · one phone each.<br>Play together and compare your discoveries out loud.</p>
<div class="segmented" role="group" aria-label="Room options"><button type="button" data-entry="create" aria-pressed="${entry === 'create'}">New room</button><button type="button" data-entry="join" aria-pressed="${entry === 'join'}">Join with a code</button></div>
${form}
${local.resume ? `<button type="button" class="btn ghost" data-action="resume" data-submit>Return to room ${esc(local.resume.code)}</button><p class="hint">Reconnect to your previous seat on this browser, while the room is still available.</p>` : ''}
<p class="ai-notice">${esc(dialogueNotice(local.dialogueMode))}</p>
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
<div class="cta">${start}
${state.hostRecoverable && !state.me.host ? '<p class="hint">The host has been away for two minutes.</p><button type="button" class="btn ghost" data-action="claimHost" data-submit>Take over as host</button>' : ''}
<p class="ai-notice">${esc(dialogueNotice(local.dialogueMode))}</p><button type="button" class="btn ghost" data-action="switch-room" data-submit>Switch room</button></div>
</section>`;
}

export function renderBriefing(state, local) {
  const r = rounds(state), q = maxQuestions(state), hours = state.config?.hoursPerRound ?? 6;
  return `<section class="screen briefing">
<p class="eyebrow">A crime foretold</p>
<blockquote class="prediction">${esc(casePrediction(state.case))}</blockquote>
<p class="lead">You are the Future Crime Police. The person in the vision is still alive. Work together to find who plans to kill them, then summon that suspect before ${esc(state.clock?.crimeAt)} tomorrow.</p>
<ol class="rules">
<li><b>Beat the clock.</b> ${r * hours} story hours, split into ${r} turns. This is not a real-time countdown.</li>
<li><b>Split up.</b> Each turn, each player interviews one person. Use all ${q} questions to finish your interview. Choose different suspects to cover more ground.</li>
<li><b>Compare notes.</b> Useful answers unlock deductions in your private notebook. Tell your team what you learn; your notes stay with you between turns.</li>
<li><b>Move on together.</b> When everyone finishes their interview, the next turn starts automatically.</li>
<li><b>Change the future.</b> Discuss your evidence, then each summon the suspect you believe is responsible. Everyone must choose correctly for a full team victory.</li>
</ol>
<div class="cta"><button type="button" class="btn" data-action="begin">Begin</button></div>
</section>`;
}

// Full-screen interlude between turns, and "time's up" before the summons. The app moves on by
// itself after TRANSITION_MS; under reduced motion it stays still until the player taps Continue.
export const TRANSITION_MS = 2500;
export function renderTransition(state, local) {
  const up = state.phase !== 'investigation', hours = state.config?.hoursPerRound ?? 6;
  const [eyebrow, title, time, sub] = up
    ? ['The summons', "Time's up", state.clock?.crimeAt, 'The forecast is about to come true. Summon your suspect.']
    : [`Turn ${state.round} of ${rounds(state)}`, `${hours} hours later`, state.clock?.time, `${state.clock?.hoursLeft} hours until the crime.`];
  return `<section class="screen transition" aria-labelledby="transition-title">
<p class="eyebrow">${esc(eyebrow)}</p>
<h1 id="transition-title" class="title">${esc(title)}</h1>
<p class="time">${esc(time)}</p>
<p class="sub">${esc(sub)}</p>
<div class="hourglass" aria-hidden="true" style="--ms:${TRANSITION_MS}ms"><i></i></div>
<div class="cta"><button type="button" class="btn ghost" data-action="continue">Continue</button></div>
</section>`;
}

function suspectGrid(state, local, {taken = new Map(), asked = new Map()} = {}) {
  return `<div class="grid" role="group" aria-label="Suspects">${state.suspects.map(s => {
    const selected = local.selected === s.id, notes = [asked.get(s.id), taken.get(s.id)].filter(Boolean);
    return `<button type="button" class="card" id="suspect-choice-${esc(s.id)}" data-suspect="${esc(s.id)}" aria-pressed="${selected}">${face(state, s)}<span class="n">${esc(s.name)}<small>${esc(s.role)}</small></span>${notes.length ? `<span class="badge">${esc(notes.join(' · '))}</span>` : ''}</button>`;
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
${chosen ? `<section class="dossier" id="suspect-dossier" tabindex="-1" aria-labelledby="dossier-name"><p class="eyebrow">Suspect file</p><h2 id="dossier-name">${esc(chosen.name)}</h2><p>${esc(chosen.profile)}</p><small>You can keep browsing. Starting the chat commits this turn to ${esc(firstName(chosen.name))}.</small><button type="button" id="selected-suspect-file" class="evidence-link" data-dossier="${esc(chosen.id)}">Your private suspect file</button></section>` : ''}
${suspectGrid(state, local, {taken, asked})}
<div class="cta"><button type="button" class="btn" data-action="question" data-submit ${chosen ? '' : 'disabled data-locked="true"'}>${chosen ? `Question ${esc(firstName(chosen.name))} →` : 'Choose a suspect'}</button><p class="hint">You get ${q} questions.</p></div>
</section>`;
}

// The chat is built from three parts so chat.js can refresh the header and transcript
// on every poll without rebuilding the composer (focus, caret and draft survive).
export const chatKey = interview => interview ? `${interview.round}:${interview.suspectId}` : null;
const chatParts = (state, local) => {
  const interview = currentInterview(state, local);
  return {interview, s: suspect(state, interview?.suspectId), q: maxQuestions(state), pending: pendingLast(interview)};
};
export const typingLabel = name => `${firstName(name)} is replying`;
// Describe how this particular answer was produced, not merely the room's configured mode.
export function replyProvenance(message) {
  const source = message.status === 'canonical' ? 'Scripted answer' : 'AI reply';
  const count = new Set(message.unlocked ?? []).size;
  return source + (count ? ` · ${plural(count, 'new deduction')}` : '');
}

export function renderChatHead(state, local) {
  const {interview, s, q} = chatParts(state, local), asked = interview.messages.length;
  return `${face(state, s, 'avatar')}<button type="button" id="chat-suspect-file" class="who file-access" data-dossier="${esc(s?.id)}" aria-label="${esc(s?.name)}, ${esc(s?.role)}. Open your private suspect file and earlier visits" title="Private suspect file and earlier visits"><b>${esc(s?.name)} <span aria-hidden="true">›</span></b><small>${esc(s?.role)}</small></button><div class="count" aria-label="${asked} of ${q} questions asked"><div class="dots" aria-hidden="true">${Array.from({length: q}, (_, i) => `<i class="${i < asked ? 'u' : ''}"></i>`).join('')}</div>${asked} of ${q}</div>`;
}

export function renderTranscript(state, local) {
  const {interview, s} = chatParts(state, local);
  const bubbles = interview.messages.map(m => `<li class="b me">${esc(m.question)}</li>${m.status === 'pending'
    ? `<li class="typing" role="img" aria-label="${esc(typingLabel(s?.name))}"><i></i><i></i><i></i></li>`
    : `<li class="b them"><small class="reply-source">${esc(replyProvenance(m))}</small>${esc(m.reply)}</li>`}`).join('');
  return `<li class="sys">Turn ${interview.round} · only you can see this conversation</li>${interview.opening ? `<li class="b them">${esc(interview.opening)}</li>` : ''}${bubbles}`;
}

export const chatEnded = (state, local) => { const {interview, pending} = chatParts(state, local); return !!interview?.closed && !pending; };
export const CHAT_DONE = `<div class="done"><p>That's all your questions for this turn.</p><button type="button" class="btn ghost" data-action="leave-chat">Continue</button></div>`;

export function renderChatFooter(state, local) {
  if (chatEnded(state, local)) return CHAT_DONE;
  const {interview, s, pending} = chatParts(state, local), hold = pending || interview.closed || local?.busy;
  const victim = String(state.case?.victim ?? '').split(',')[0].trim();
  const labels = victim ? {...topicLabels, relationship: `Do you know ${victim}?`, motive: `Have you had any disagreements with ${victim} recently?`} : topicLabels;
  return `<p class="suggestion-hint">Suggestions fill an empty draft. Review, then send.</p><div class="chips" role="group" aria-label="Suggested question drafts">${Object.values(labels).map(label => `<button type="button" class="chip" data-chip="${esc(label)}" ${hold || String(local?.draft ?? '').length ? 'disabled' : ''}>${esc(label)}</button>`).join('')}</div>
<form id="question-form" class="composer"><label class="visually-hidden" for="question">Your question</label><textarea id="question" name="question" rows="1" maxlength="300" placeholder="Ask ${esc(firstName(s?.name))} anything…" enterkeyhint="send" autocomplete="off" ${interview.closed ? 'readonly' : ''}>${esc(local?.draft)}</textarea><button type="button" class="send" aria-label="Send question" ${hold || !String(local?.draft ?? '').trim() ? 'disabled' : ''}>↑</button></form>`;
}

export function renderChat(state, local) {
  return `<section class="screen chat">
<div class="chead">${renderChatHead(state, local)}</div>
<ol id="transcript" class="msgs" aria-label="Private interview" tabindex="0">${renderTranscript(state, local)}</ol>
<button type="button" class="new-reply" hidden aria-controls="transcript">New reply ↓</button>
<div class="cfoot">${renderChatFooter(state, local)}</div>
</section>`;
}

export const ADVANCE_CONFIRM = Object.freeze({title: 'Advance for everyone?', label: 'Advance now',
  body: '<p>Anyone still talking loses their remaining questions this turn. Agree it with the table first.</p>'});

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

export function summonConfirmation(s) {
  const first = firstName(s?.name);
  return {title: `Summon ${s?.name}?`, label: `Summon ${first}`,
    body: `<p>Your summons is private and final. If ${esc(first)} is innocent, an innocent person is arrested.</p><p><b>This cannot be undone.</b></p>`};
}

export function renderAccuse(state, local) {
  if (state.me.vote) {
    const waiting = waitingFor(state, p => p.voteSubmitted);
    return `<section class="screen accuse sealed">
<p class="eyebrow">The summons</p>
<h1 class="title">Your summons is sealed.</h1>
<div class="sealed-card">${face(state, suspect(state, state.me.vote))}<b>${esc(suspect(state, state.me.vote)?.name)}</b></div>
<p class="sub">${waiting.length ? `Waiting for: ${esc(waiting.join(', '))}` : 'Everyone has chosen. The timeline is turning…'}</p>
${state.me.host && state.canFinalizeAccusations ? '<div class="cta"><button type="button" class="btn danger" data-action="finalizeAccusations" data-submit>Reveal without them</button></div>' : ''}
${state.hostRecoverable && !state.me.host ? '<div class="cta"><button type="button" class="btn ghost" data-action="claimHost" data-submit>Take over as host</button></div>' : ''}
</section>`;
  }
  const chosen = suspect(state, local.selected);
  return `<section class="screen accuse">
<h1 class="title">Who is the killer?</h1>
<p class="sub">Summon one suspect, on your own. Talk it over first.</p>
${chosen ? `<section class="dossier" id="suspect-dossier" tabindex="-1"><h2>${esc(chosen.name)}</h2><p>${esc(chosen.profile)}</p><button type="button" id="selected-suspect-file" class="evidence-link" data-dossier="${esc(chosen.id)}">Review your private suspect file</button></section>` : ''}
${suspectGrid(state, local)}
<div class="cta"><button type="button" class="btn" data-action="summon" data-submit ${chosen ? '' : 'disabled data-locked="true"'}>${chosen ? `Summon ${esc(firstName(chosen.name))} →` : 'Choose a suspect'}</button><p class="hint">This cannot be undone.</p></div>
</section>`;
}

const OUTCOMES = {complete: 'The timeline shifts.', partial: 'The timeline wavers.', defeat: 'The timeline holds.'};
const verdict = v => v.correct ? 'Got it right' : v.suspectId ? 'Wrong suspect' : 'No summons';
export function renderReveal(state, local) {
  const r = state.result, culprit = suspect(state, r.culpritId);
  const votes = r.votes.map(v => `<li class="${v.correct ? 'hit' : 'miss'}"><b>${esc(playerName(state, v.playerId))}${v.playerId === state.me.id ? ' <small>(you)</small>' : ''}</b><span>${v.suspectId ? esc(suspect(state, v.suspectId)?.name) : 'No summons'}</span><span class="mark" aria-hidden="true">${v.correct ? '✓' : '✗'}</span><span class="visually-hidden">${verdict(v)}</span></li>`).join('');
  return `<section class="screen reveal">
<p class="eyebrow">The truth</p>
<h1 class="title">${OUTCOMES[r.outcome] ?? 'The timeline is revealed.'}</h1>
<p class="sub">${r.correct} of ${r.total} summoned the killer.</p>
<div class="culprit">${face(state, culprit)}<div><small>The killer</small><b>${esc(culprit?.name)}</b><span>${esc(culprit?.role)}</span></div></div>
<ul class="votes">${votes}</ul>
${r.solution?.motive ? `<h2 class="label">Why</h2><p class="solution">${esc(r.solution.motive)}</p>` : ''}
${r.solution?.plan ? `<h2 class="label">How</h2><p class="solution">${esc(r.solution.plan)}</p>` : ''}
<div class="debrief"><h2 class="label">Your investigation</h2><p>${plural(state.me.interviews.length, 'interview')} · ${plural(state.me.interviews.reduce((n, i) => n + i.messages.length, 0), 'question')} · ${state.me.deductions.length} of ${state.deductionTotal} deductions</p><p class="sub">Compare the truth with what you heard. Your conversations and deductions remain private.</p><button type="button" class="btn ghost" data-tab="deductions">Review your evidence</button></div>
<div class="cta"><button type="button" class="btn ghost" data-action="new-investigation" data-submit>New investigation</button><p class="hint">Your private drafts are kept. You can return to this room while it remains available.</p></div>
</section>`;
}

// Resolve evidence only within this player's exact interview. A legacy deduction without
// messageId may still use the message's unlock receipt, never guessed question text.
export function deductionSource(state, deduction) {
  const interview = state.me.interviews.find(i => i.round === deduction.round && i.suspectId === deduction.suspectId);
  if (!interview) return null;
  const message = interview.messages.find(m => deduction.messageId ? m.id === deduction.messageId : m.unlocked?.includes(deduction.id));
  return {interview, message};
}

export function renderDeductions(state, local = {}) {
  const notebook = local.notebook ?? {}, selected = state.me.interviews.find(i => chatKey(i) === notebook.interview);
  if (selected && (!notebook.suspect || selected.suspectId === notebook.suspect)) return renderInterviewReview(state, selected, notebook, local.archiveDraft, local.draftsPersistent);
  if (notebook.suspect && suspect(state, notebook.suspect)) return renderSuspectFile(state, notebook);
  const history = notebook.section === 'interviews', searching = notebook.section === 'search';
  const sections = `<div class="segmented" role="group" aria-label="Private notebook"><button type="button" id="notebook-deductions" data-notebook="deductions" aria-pressed="${!history && !searching}">Deductions</button><button type="button" id="notebook-interviews" data-notebook="interviews" aria-pressed="${history}">Interviews (${state.me.interviews.length})</button><button type="button" id="notebook-search" data-notebook="search" aria-pressed="${searching}">Search</button></div>`;
  if (searching) return `<section class="screen notebook evidence-search"><h1 class="title">Search your evidence</h1><p class="sub">Find your own questions, replies and unlocked deductions. Nothing is sent or shared.</p>${sections}
<label for="evidence-query">Search words or a suspect’s name</label><div class="search-controls"><input type="search" id="evidence-query" maxlength="100" value="${esc(notebook.query)}" placeholder="Try a name, place or object" autocomplete="off" spellcheck="false" aria-controls="evidence-results"><button type="button" class="btn ghost small" data-action="clear-search">Clear</button></div>
<div id="evidence-results">${renderEvidenceResults(state, notebook.query)}</div></section>`;
  if (history) {
    const interviews = [...state.me.interviews].sort((a, b) => b.round - a.round);
    return `<section class="screen notebook"><h1 class="title">Your interviews</h1><p class="sub">Only you can read these. Reviewing never uses a question.</p>${sections}
${interviews.length ? `<ol class="interview-list">${interviews.map(i => `<li><button type="button" class="btn ghost interview-link" id="interview-${esc(chatKey(i))}" data-interview="${esc(chatKey(i))}"><span>Turn ${i.round} · ${esc(suspect(state, i.suspectId)?.name)}</span><small>${plural(i.messages.length, 'question')} · ${pendingLast(i) ? 'Reply pending' : i.closed ? 'Closed' : 'In progress'}</small></button></li>`).join('')}</ol>` : '<p class="hint">Your first conversation will be saved here as you question a suspect.</p>'}</section>`;
  }
  const unlocked = state.me.deductions, total = Math.max(state.deductionTotal ?? 0, unlocked.length);
  const items = unlocked.map(d => {
    const source = deductionSource(state, d);
    return `<li class="unlocked"><p>${esc(d.text)}</p><small>From ${esc(firstName(suspect(state, d.suspectId)?.name))} · Turn ${esc(d.round)}</small>${source ? `<button type="button" class="evidence-link" id="source-${esc(d.id)}" data-interview="${esc(chatKey(source.interview))}" data-message="${esc(source.message?.id)}" data-deduction="${esc(d.id)}">${source.message ? 'Read source answer' : 'Review source interview'}</button>` : ''}</li>`;
  }).join('')
    + Array.from({length: total - unlocked.length}, () => `<li class="locked" aria-label="Locked deduction">${icon.lock}</li>`).join('');
  return `<section class="screen deductions">
<h1 class="title">Deductions</h1>
<p class="sub">${unlocked.length} of ${total} unlocked</p>
${sections}
${unlocked.length ? '' : '<p class="hint">They unlock as you talk to the suspects.</p>'}
<ol class="dlist">${items}</ol>
</section>`;
}

// Search only the already-authorised personal projection. No case definitions, other
// players, unsent drafts or locked deductions are consulted or uploaded.
const searchText = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export function searchEvidence(state, query) {
  const words = searchText(String(query ?? '').slice(0, 100)).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const results = [], matches = (...parts) => { const text = searchText(parts.join(' ')); return words.every(word => text.includes(word)); };
  for (const i of [...state.me.interviews].sort((a, b) => b.round - a.round)) {
    const name = suspect(state, i.suspectId)?.name ?? 'Suspect';
    if (i.opening && matches(name, i.opening)) results.push({kind: 'opening', id: chatKey(i), interview: i, name, text: i.opening});
    for (const m of i.messages) {
      const reply = m.status === 'pending' ? '' : m.reply;
      if (matches(name, m.question, reply)) results.push({kind: 'answer', id: m.id, interview: i, message: m, name, text: reply || m.question});
    }
  }
  for (const d of state.me.deductions) {
    const name = suspect(state, d.suspectId)?.name ?? 'Suspect';
    if (matches(name, d.text)) results.push({kind: 'deduction', id: d.id, ...deductionSource(state, d), deduction: d, name, text: d.text});
  }
  return results;
}

function evidenceExcerpt(text, query) {
  const value = String(text ?? ''), offsets = [];
  let normal = '', offset = 0;
  for (const point of value) {
    const folded = searchText(point);
    for (let n = 0; n < folded.length; n++) offsets.push(offset);
    normal += folded; offset += point.length;
  }
  const indexes = searchText(query).trim().split(/\s+/).filter(Boolean).map(word => normal.indexOf(word)).filter(n => n >= 0);
  const start = Math.max(0, (indexes.length ? offsets[Math.min(...indexes)] : 0) - 50), end = start + 180;
  return (start ? '…' : '') + value.slice(start, end) + (value.length > end ? '…' : '');
}

export function renderEvidenceResults(state, query = '') {
  if (!String(query).trim()) return '<p class="hint" role="status">Enter a few words to search your private evidence. Reviewing uses no questions.</p>';
  const results = searchEvidence(state, query);
  return `<p class="hint" role="status">${plural(results.length, 'result')} in your private evidence.</p>${results.length ? `<ol class="evidence-results">${results.map(r => {
    const label = r.kind === 'deduction' ? 'Deduction' : r.kind === 'opening' ? 'Opening statement' : r.message.status === 'pending' ? 'Question · reply pending' : replyProvenance(r.message);
    const round = r.interview?.round ?? r.deduction?.round;
    return `<li><p class="label">${esc(r.name)} · Turn ${esc(round)} · ${esc(label)}</p>${r.kind === 'answer' ? `<p><b>You:</b> ${esc(evidenceExcerpt(r.message.question, query))}</p>` : ''}<p>${esc(evidenceExcerpt(r.text, query))}</p>${r.interview ? `<button type="button" class="evidence-link" id="search-${r.kind}-${esc(r.id)}" data-interview="${esc(chatKey(r.interview))}" data-message="${esc(r.message?.id)}" data-deduction="${esc(r.deduction?.id)}">${r.kind === 'deduction' ? 'Review source' : 'Read in interview'}</button>` : '<p class="hint">The source interview is no longer available.</p>'}</li>`;
  }).join('')}</ol>` : '<p>No matching evidence yet. Try fewer words or another spelling. Only your own recorded evidence is searched.</p>'}`;
}

export function renderSuspectFile(state, notebook) {
  const person = suspect(state, notebook.suspect);
  const visits = state.me.interviews.filter(i => i.suspectId === person.id).sort((a, b) => b.round - a.round);
  const clues = state.me.deductions.filter(d => d.suspectId === person.id);
  return `<section class="screen notebook suspect-file">
<button type="button" id="dossier-return" class="btn ghost small" data-action="dossier-return">Return to ${notebook.returnTab === 'deductions' ? 'notebook' : state.phase === 'accusation' ? 'Summon' : state.phase === 'reveal' ? 'Outcome' : 'Investigate'}</button>
<p class="eyebrow">Your private suspect file</p><h1 class="title" id="suspect-file-title" tabindex="-1">${esc(person.name)}</h1><p class="sub">${esc(person.role)}</p><p>${esc(person.profile)}</p>
<p class="hint">Only your own recorded visits and unlocked deductions appear here. Reviewing uses no questions.</p>
<h2 class="label">Your visits</h2>
${visits.length ? `<ol class="interview-list">${visits.map(i => `<li><button type="button" class="btn ghost interview-link" id="interview-${esc(chatKey(i))}" data-interview="${esc(chatKey(i))}"><span>Turn ${i.round}</span><small>${plural(i.messages.length, 'question')} · ${pendingLast(i) ? 'Reply pending' : i.closed ? 'Closed' : 'In progress'}</small></button></li>`).join('')}</ol>` : '<p>You have not questioned this suspect yet.</p>'}
<h2 class="label">Your deductions from this suspect</h2>
${clues.length ? `<ol class="dlist">${clues.map(d => { const source = deductionSource(state, d); return `<li class="unlocked"><p>${esc(d.text)}</p>${source ? `<button type="button" class="evidence-link" id="source-${esc(d.id)}" data-interview="${esc(chatKey(source.interview))}" data-message="${esc(source.message?.id)}" data-deduction="${esc(d.id)}">${source.message ? 'Read source answer' : 'Review source interview'} · Turn ${d.round}</button>` : ''}</li>`; }).join('')}</ol>` : '<p>No deductions unlocked from this suspect yet.</p>'}
</section>`;
}

function renderInterviewReview(state, interview, notebook, draft, persistent = true) {
  const s = suspect(state, interview.suspectId);
  const source = state.me.deductions.find(d => d.id === notebook.deduction && deductionSource(state, d)?.interview === interview);
  return `<section class="screen notebook review">
<button type="button" id="notebook-back" class="btn ghost small" data-action="notebook-back">Back to ${notebook.suspect ? 'suspect file' : notebook.section === 'search' ? 'search results' : notebook.section === 'interviews' ? 'interviews' : 'deductions'}</button>
<p class="eyebrow">Private interview · Turn ${interview.round}</p><h1 class="title" id="review-title" tabindex="-1">${esc(s?.name)}</h1>
<p class="sub">Read-only · reviewing uses no questions. Return to ${state.phase === 'reveal' ? 'Outcome' : state.phase === 'accusation' ? 'Summon' : 'Investigate'} when you are ready.</p>
${source ? `<aside class="source-note"><b>Source for your deduction</b><p>${esc(source.text)}</p></aside>` : ''}
<ol class="review-transcript">${interview.opening ? `<li class="b them"><small>${esc(s?.name)}</small>${esc(interview.opening)}</li>` : ''}${interview.messages.map((m, n) => `<li class="review-exchange${m.id === notebook.message ? ' source-answer' : ''}" id="review-message-${esc(m.id)}" tabindex="-1"><p class="b me"><small>You · Question ${n + 1}</small>${esc(m.question)}</p><p class="b them"><small>${esc(s?.name)}${m.status !== 'pending' ? ' · ' + esc(replyProvenance(m)) : ''}</small>${m.status === 'pending' ? 'Reply pending. This conversation will update when it arrives.' : esc(m.reply)}</p></li>`).join('')}</ol>
${draft ? `<aside class="saved-draft"><h2 class="label">Unsent draft · Turn ${interview.round}</h2><p>${esc(draft)}</p><p class="sub">${persistent ? 'Saved on this browser.' : 'Only in this open tab. Storage is unavailable; reloading will lose this draft.'} This text was never sent.</p></aside>` : ''}
</section>`;
}

export function renderCaseFile(state) {
  const c = state.case;
  return `<section class="screen casefile">
<h1 class="title">Case file</h1>
<blockquote class="prediction">${esc(casePrediction(c))}</blockquote>
<dl class="facts"><dt>Victim</dt><dd>${esc(c.victim)}</dd><dt>Place</dt><dd>${esc(c.place)}</dd><dt>Method</dt><dd>${esc(c.method)}</dd><dt>The crime</dt><dd>${esc(state.clock?.crimeAt)}, tomorrow</dd></dl>
<h2 class="label">Room</h2>
<button type="button" class="btn ghost" data-action="switch-room" data-submit>Switch room</button>
<p class="room-line"><span class="room-code small">${esc(state.code)}</span><button type="button" class="btn ghost small" data-action="copy-invite">Copy invite link</button></p>
${state.hostRecoverable && !state.me.host ? '<p class="hint">The host has been away for two minutes.</p><button type="button" class="btn ghost" data-action="claimHost" data-submit>Take over as host</button>' : ''}
</section>`;
}

export function switchRoomConfirmation(state, invite = '') {
  return {title: invite ? `Open invitation to ${invite}?` : 'Switch rooms?', label: invite ? 'Open invitation' : 'Choose another room',
    body: `<p>You are in room <b>${esc(state.code)}</b>. ${invite ? `Open the join screen for <b>${esc(invite)}</b>?` : 'Return to the join screen?'}</p><p>Your seat stays at this table. Your interviews and saved drafts are kept. Return on this browser while the room is still available; this does not pause or extend the game.</p>${state.me.host ? '<p>You are the host. If you leave, another agent can take over after two minutes without contact.</p>' : ''}`};
}
