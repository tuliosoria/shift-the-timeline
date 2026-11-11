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
  return {status: response.status, data};
}

// The same action object always travels with the same id, so a retry after a lost
// response is recognised by the server instead of being applied twice.
const requestIds = new WeakMap();
export function requestIdFor(action) {
  if (typeof action.id === 'string') return action.id;
  if (!requestIds.has(action)) requestIds.set(action, newRequestId());
  return requestIds.get(action);
}
export async function command(code, action) {
  const {data} = await fetchJson(`/api/rooms/${encodeURIComponent(code)}/actions`, {body: {...action, id: requestIdFor(action)}});
  return data;
}

export function myLastMessagePending(state) {
  const interviews = state?.me?.interviews ?? [];
  return interviews.some(i => i.messages?.at(-1)?.status === 'pending');
}
export function pollDelay(state, hidden) {
  if (hidden) return 15000;
  return myLastMessagePending(state) ? 1000 : 2500;
}

// getState() returns the current snapshot, or null to skip this tick (no room, or a command in flight).
export function pollLoop({getState, onState, onError = () => {}, isHidden = () => document.hidden}) {
  let timer = null, stopped = false, running = false;
  async function tick() {
    clearTimeout(timer);
    if (stopped || running) return;
    running = true;
    try {
      const state = getState();
      if (state?.code) {
        const {status, data} = await fetchJson(`/api/rooms/${encodeURIComponent(state.code)}/state?since=${state.version}`);
        if (status === 200 && data) onState(data, state);
      }
    } catch (error) { onError(error); }
    finally {
      running = false;
      if (!stopped) timer = setTimeout(tick, pollDelay(getState(), isHidden()) + Math.floor(Math.random() * 300));
    }
  }
  timer = setTimeout(tick, pollDelay(getState(), isHidden()));
  return {now: tick, stop() { stopped = true; clearTimeout(timer); }};
}
