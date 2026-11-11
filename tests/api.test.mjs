import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../public/api.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

function stubFetch(t, responses) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({url, init, body: init?.body ? JSON.parse(init.body) : undefined});
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response(next.status === 204 ? null : JSON.stringify(next.body), {status: next.status});
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

test('fetchJson returns status and data, and 204 has no data', async t => {
  const calls = stubFetch(t, [{status: 200, body: {ok: true}}, {status: 204}]);
  assert.deepEqual(await api.fetchJson('/api/session', {method: 'POST', body: {}}), {status: 200, data: {ok: true}});
  assert.deepEqual(await api.fetchJson('/api/rooms/ABCD2345/state?since=3'), {status: 204, data: null});
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[1].init.method, 'GET');
});
test('fetchJson rejects with the server message and status', async t => {
  stubFetch(t, [{status: 409, body: {error: 'Already asked.'}}]);
  await assert.rejects(api.fetchJson('/x', {method: 'POST', body: {}}), e => e.status === 409 && e.message === 'Already asked.');
});
test('command adds one request id and reuses it when the same action is retried', async t => {
  const calls = stubFetch(t, [new TypeError('network down'), {status: 200, body: {code: 'ABCD2345', version: 4}}]);
  const action = {type: 'ask', question: 'Where were you?', round: 1};
  await assert.rejects(api.command('ABCD2345', action));
  assert.deepEqual(await api.command('ABCD2345', action), {code: 'ABCD2345', version: 4});
  assert.equal(calls[0].url, '/api/rooms/ABCD2345/actions');
  assert.match(calls[0].body.id, /^[0-9a-f]{32}$/);
  assert.equal(calls[1].body.id, calls[0].body.id);
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['id', 'question', 'round', 'type']);
  assert.equal(action.id, undefined, 'the caller object is not mutated');
});
test('poll delay is 2500 ms, 1000 ms while my last message is pending, and 15000 ms when hidden', () => {
  const pending = {round: 1, me: {interviews: [{round: 1, messages: [{status: 'complete'}, {status: 'pending'}]}]}};
  const settled = {round: 1, me: {interviews: [{round: 1, messages: [{status: 'complete'}]}]}};
  assert.equal(api.pollDelay(settled, false), 2500);
  assert.equal(api.pollDelay(pending, false), 1000);
  assert.equal(api.pollDelay(pending, true), 15000);
  assert.equal(api.pollDelay(null, false), 2500);
});
