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
test('poll delay is 2500 ms, 1500 ms while my last message is pending, 2500 ms after 10 s of pending, and 15000 ms when hidden', () => {
  const pending = {round: 1, me: {interviews: [{round: 1, messages: [{status: 'complete'}, {status: 'pending'}]}]}};
  const settled = {round: 1, me: {interviews: [{round: 1, messages: [{status: 'complete'}]}]}};
  assert.equal(api.pollDelay(settled, false), 2500);
  assert.equal(api.pollDelay(pending, false), 1500);
  assert.equal(api.pollDelay(pending, false, 9999), 1500);
  assert.equal(api.pollDelay(pending, false, 10000), 2500);
  assert.equal(api.pollDelay(pending, true), 15000);
  assert.equal(api.pollDelay(null, false), 2500);
});
test('the poll loop backs off once a reply has been pending for 10 s', async t => {
  t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: 0});
  t.mock.method(Math, 'random', () => 0);
  const pending = {code: 'ABCD2345', version: 1, round: 1, me: {interviews: [{round: 1, messages: [{status: 'pending'}]}]}};
  const calls = stubFetch(t, Array.from({length: 20}, () => ({status: 204})));
  const loop = api.pollLoop({getState: () => pending, onState: () => {}, isHidden: () => false});
  const polls = [];
  for (let ms = 0; ms < 16000; ms += 100) {
    t.mock.timers.tick(100);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    while (polls.length < calls.length) polls.push(Date.now());
  }
  loop.stop();
  const gaps = polls.slice(1).map((at, i) => at - polls[i]);
  assert.equal(polls[0], 1500);
  assert.ok(gaps.filter((_, i) => polls[i] < 10000).every(gap => gap === 1500), `fast gaps ${gaps}`);
  assert.ok(gaps.filter((_, i) => polls[i] >= 10000).every(gap => gap === 2500), `slow gaps ${gaps}`);
  assert.ok(polls.some(at => at > 10000));
});
test('a missing room or a retired case version means the room is gone', () => {
  const error = (status, message = 'x') => Object.assign(new Error(message), {status});
  assert.equal(api.roomGone(error(404)), 'expired');
  assert.equal(api.roomGone(error(503, 'Case version unavailable.')), 'expired');
  assert.equal(api.roomGone(error(401)), 'lost');
  assert.equal(api.roomGone(error(503, 'New rooms are temporarily paused.')), null);
  assert.equal(api.roomGone(error(500)), null);
  assert.equal(api.roomGone(new TypeError('network down')), null);
});


test('poll errors retain their originating snapshot after the selected room changes', async t => {
  let reject, active = {code: 'ABCD2345', version: 7, localEpoch: 2};
  const source = active, failures = [];
  const original = globalThis.fetch;
  globalThis.fetch = () => new Promise((_, fail) => { reject = fail; });
  t.after(() => { globalThis.fetch = original; });
  const loop = api.pollLoop({getState: () => active, onState: () => {}, onError: (error, snapshot) => failures.push({error, snapshot}), isHidden: () => false});
  t.after(() => loop.stop());
  const running = loop.now();
  active = {code: 'EFGH6789', version: 1, localEpoch: 3};
  const error = new Error('Old room unavailable');
  reject(error);
  await running;
  assert.equal(failures.length, 1);
  assert.equal(failures[0].snapshot, source);
  assert.equal(failures[0].error, error);
  assert.notEqual(failures[0].snapshot.localEpoch, active.localEpoch);
});
