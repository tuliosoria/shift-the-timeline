// Thin client for the room API: JSON requests, idempotent commands and the polling loop.
export function newRequestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchJson(path, {method, body} = {}) {
  const response = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: body === undefined ? {} : {'Content-Type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 204) return {status: 204, data: null};
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error ?? 'This action could not be completed.');
    error.status = response.status;
    throw error;
  }
  // An HTTP success with a missing/truncated JSON body does not prove delivery.
  // Leave its request id held for a safe retry rather than clearing the action.
  if (!isRecord(data)) throw invalidResponse();
  return {status: response.status, data};
}

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const invalidResponse = () => new Error('The server returned an incomplete response. Retry safely.');
const nonempty = value => typeof value === 'string' && value.length > 0;
const records = (value, valid) => Array.isArray(value) && value.every(item => isRecord(item) && valid(item));
const validMessage = m => nonempty(m.id) && typeof m.question === 'string' && nonempty(m.status)
  && (m.status === 'pending' ? m.reply === null : typeof m.reply === 'string')
  && Array.isArray(m.unlocked) && m.unlocked.every(nonempty);
const validInterview = i => Number.isSafeInteger(i.round) && i.round > 0 && nonempty(i.suspectId)
  && typeof i.closed === 'boolean' && (i.opening == null || typeof i.opening === 'string') && records(i.messages, validMessage);
const validDeduction = d => nonempty(d.id) && typeof d.text === 'string' && nonempty(d.suspectId)
  && Number.isSafeInteger(d.round) && d.round > 0 && (d.messageId == null || nonempty(d.messageId));
const validPerson = p => nonempty(p.id) && typeof p.name === 'string';
const validResult = r => isRecord(r) && nonempty(r.culpritId) && nonempty(r.outcome)
  && records(r.votes, v => nonempty(v.playerId) && (v.suspectId === null || nonempty(v.suspectId)) && typeof v.correct === 'boolean')
  && (r.solution == null || isRecord(r.solution));

// Validate the acknowledgement envelope before any held command or session is changed.
// Extra fields are allowed, so additive server updates remain compatible.
export function validateRoomState(state, {code, playerId} = {}) {
  if (!isRecord(state) || typeof state.code !== 'string' || !/^[A-HJ-NP-Z2-9]{8}$/.test(state.code) || (code && state.code !== code)
      || !Number.isSafeInteger(state.version) || state.version < 1 || !Number.isSafeInteger(state.round) || state.round < 0
      || !['lobby', 'investigation', 'accusation', 'reveal'].includes(state.phase)
      || !isRecord(state.me) || typeof state.me.id !== 'string' || !state.me.id || (playerId && state.me.id !== playerId)
      || !records(state.me.interviews, validInterview) || !records(state.me.deductions, validDeduction)
      || !records(state.players, validPerson) || !records(state.suspects, validPerson)
      || (state.phase === 'reveal' && !validResult(state.result))
      || !isRecord(state.case) || !isRecord(state.config) || !isRecord(state.clock)) throw invalidResponse();
  return state;
}
export function validateRoomEntry(entry, code) {
  if (!isRecord(entry) || typeof entry.playerId !== 'string' || !entry.playerId || typeof entry.code !== 'string'
      || (code && entry.code !== code)) throw invalidResponse();
  validateRoomState(entry.state, {code: entry.code, playerId: entry.playerId});
  return entry;
}

// The same action object always travels with the same id, so a retry after a lost
// response is recognised by the server instead of being applied twice.
const requestIds = new WeakMap();
export function requestIdFor(action) {
  if (typeof action.id === 'string') return action.id;
  if (!requestIds.has(action)) requestIds.set(action, newRequestId());
  return requestIds.get(action);
}
export async function command(code, action, {playerId} = {}) {
  const {data} = await fetchJson(`/api/rooms/${encodeURIComponent(code)}/actions`, {body: {...action, id: requestIdFor(action)}});
  return validateRoomState(data, {code, playerId});
}

export function myLastMessagePending(state) {
  const interviews = state?.me?.interviews ?? [];
  return interviews.some(i => i.messages?.at(-1)?.status === 'pending');
}
// A pending reply is polled faster, but only for its first 10 s: a slow provider call
// should not keep every waiting phone at the fast rate.
export function pollDelay(state, hidden, pendingForMs = 0) {
  if (hidden) return 15000;
  if (!myLastMessagePending(state)) return 2500;
  return pendingForMs >= 10000 ? 2500 : 1500;
}

// 404: the room expired. 503 'Case version unavailable.': the room belongs to a case version
// this deployment no longer serves, so it will never come back either. 401: the seat is lost.
export function roomGone(error) {
  if (error?.status === 404 || (error?.status === 503 && error.message === 'Case version unavailable.')) return 'expired';
  if (error?.status === 401) return 'lost';
  return null;
}

// getState() returns the current snapshot, or null to skip this tick (no room, or a command in flight).
// onSuccess includes unchanged 204s and retains the source snapshot for stale-room guards.
export function pollLoop({getState, onState, onSuccess = () => {}, onError = () => {}, isHidden = () => document.hidden}) {
  let timer = null, stopped = false, running = false, pendingSince = null;
  const delay = () => {
    const state = getState();
    if (!myLastMessagePending(state)) pendingSince = null;
    else pendingSince ??= Date.now();
    return pollDelay(state, isHidden(), pendingSince === null ? 0 : Date.now() - pendingSince);
  };
  async function tick() {
    clearTimeout(timer);
    if (stopped || running) return;
    running = true;
    let state;
    try {
      state = getState();
      if (state?.code) {
        const {status, data} = await fetchJson(`/api/rooms/${encodeURIComponent(state.code)}/state?since=${state.version}`);
        if (status === 200) onState(validateRoomState(data, {code: state.code, playerId: state.me?.id}), state);
        else if (status !== 204) throw invalidResponse();
        onSuccess(state, status);
      }
    } catch (error) { onError(error, state); }
    finally {
      running = false;
      if (!stopped) timer = setTimeout(tick, delay() + Math.floor(Math.random() * 300));
    }
  }
  timer = setTimeout(tick, delay());
  return {now: tick, stop() { stopped = true; clearTimeout(timer); }};
}
