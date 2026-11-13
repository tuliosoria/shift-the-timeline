import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../public/api.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

const snapshot = (changes = {}) => ({code: 'ABCD2345', version: 4, round: 1, phase: 'investigation', me: {id: 'agent-1', interviews: [], deductions: []}, players: [], suspects: [], case: {}, config: {}, clock: {}, ...changes});

function stubFetch(t, responses) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({url, init, body: init?.body ? JSON.parse(init.body) : undefined});
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response(next.status === 204 ? null : next.raw ?? JSON.stringify(next.body), {status: next.status});
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
  const calls = stubFetch(t, [new TypeError('network down'), {status: 200, body: snapshot()}]);
  const action = {type: 'ask', question: 'Where were you?', round: 1};
  await assert.rejects(api.command('ABCD2345', action));
  assert.deepEqual(await api.command('ABCD2345', action), snapshot());
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

for (const response of [{status: 200, raw: '{"code":'}, {status: 200, body: null}, {status: 200, body: []}, {status: 200, raw: ''}]) {
  test(`successful invalid JSON envelope is an ambiguous failure: ${JSON.stringify(response)}`, async t => {
    stubFetch(t, [response]);
    await assert.rejects(api.fetchJson('/api/rooms'), error => error.status === undefined && /incomplete response/.test(error.message));
  });
}
test('malformed error bodies retain their HTTP status instead of appearing successful', async t => {
  stubFetch(t, [{status: 503, raw: '<html>Unavailable</html>'}]);
  await assert.rejects(api.fetchJson('/api/rooms'), error => error.status === 503);
});
test('acknowledgements require the expected room, player and complete snapshot envelope', () => {
  const valid = snapshot({futureField: {allowed: true}});
  assert.equal(api.validateRoomState(valid, {code: valid.code, playerId: valid.me.id}), valid);
  for (const invalid of [null, {}, snapshot({code: 'EFGH6789'}), snapshot({version: null}), snapshot({version: -1}),
    snapshot({round: '1'}), snapshot({me: {id: 'agent-2', interviews: [], deductions: []}}),
    snapshot({me: {id: 'agent-1'}}), snapshot({players: null}), snapshot({phase: ''}), snapshot({config: null})]) {
    assert.throws(() => api.validateRoomState(invalid, {code: 'ABCD2345', playerId: 'agent-1'}), /incomplete response/);
  }
  const entry = {code: valid.code, playerId: valid.me.id, state: valid, futureField: true};
  assert.equal(api.validateRoomEntry(entry, valid.code), entry);
  for (const invalid of [null, {}, {...entry, playerId: ''}, {...entry, playerId: 'wrong-agent'}, {...entry, code: 'EFGH6789'}, {...entry, state: null}]) {
    assert.throws(() => api.validateRoomEntry(invalid), /incomplete response/);
  }
  assert.throws(() => api.validateRoomEntry(entry, 'EFGH6789'), /incomplete response/);
});
test('invalid command acknowledgements keep the same request id on every retry', async t => {
  const responses = [{status: 200, raw: '{"code":'}, {status: 200, body: null}, {status: 200, body: {}},
    {status: 200, body: snapshot({code: 'EFGH6789'})}, {status: 200, body: snapshot({me: {id: 'agent-2', interviews: [], deductions: []}})},
    {status: 204}, {status: 200, body: snapshot()}];
  const count = responses.length, calls = stubFetch(t, responses), action = {type: 'ask', question: 'Where?', round: 1};
  for (let i = 0; i < count - 1; i++) await assert.rejects(api.command('ABCD2345', action, {playerId: 'agent-1'}), /incomplete response/);
  assert.deepEqual(await api.command('ABCD2345', action, {playerId: 'agent-1'}), snapshot());
  assert.equal(new Set(calls.map(call => call.body.id)).size, 1);
});
test('polls accept 204 but reject incomplete or foreign snapshots without replacing current state', async t => {
  const source = snapshot(), states = [], failures = [];
  stubFetch(t, [{status: 204}, {status: 200, body: {}}, {status: 200, body: snapshot({code: 'EFGH6789'})},
    {status: 200, body: snapshot({version: 5})}]);
  const loop = api.pollLoop({getState: () => source, onState: next => states.push(next),
    onError: (error, original) => failures.push({error, original}), isHidden: () => false});
  t.after(() => loop.stop());
  for (let i = 0; i < 4; i++) await loop.now();
  assert.deepEqual(states, [snapshot({version: 5})]);
  assert.equal(failures.length, 2);
  assert.ok(failures.every(failure => failure.original === source && /incomplete response/.test(failure.error.message)));
});

test('nested records and phase-required reveal data cannot become an acknowledgement', () => {
  const full = snapshot({
    me: {id: 'agent-1', interviews: [{round: 1, suspectId: 'suspect-1', closed: false, opening: 'Hello',
      messages: [{id: 'message-1', question: 'Where?', status: 'complete', reply: 'Here.', unlocked: ['clue-1']}]}],
      deductions: [{id: 'clue-1', text: 'A clue', suspectId: 'suspect-1', round: 1, messageId: 'message-1'}]},
    players: [{id: 'agent-1', name: 'Ada'}], suspects: [{id: 'suspect-1', name: 'Character One'}],
  });
  const mutations = [
    s => { s.me.interviews = [null]; }, s => { s.me.interviews[0].messages = [null]; },
    s => { s.me.interviews[0].messages[0].unlocked = {}; }, s => { s.me.interviews[0].messages[0].reply = {}; },
    s => { s.me.deductions = [null]; }, s => { s.me.deductions[0].text = {}; },
    s => { s.players = [null]; }, s => { s.suspects = [null]; },
    s => { s.phase = 'reveal'; }, s => { s.phase = 'reveal'; s.result = {votes: []}; },
    s => { s.phase = 'reveal'; s.result = {culpritId: 'suspect-1', outcome: 'partial', votes: [null]}; },
  ];
  assert.equal(api.validateRoomState(full), full);
  for (const status of ['canonical', 'complete', 'future-resolved-status']) {
    const next = structuredClone(full); next.me.interviews[0].messages[0].status = status;
    assert.equal(api.validateRoomState(next), next, 'resolved status additions remain compatible');
  }
  const pending = structuredClone(full);
  Object.assign(pending.me.interviews[0].messages[0], {status: 'pending', reply: null});
  assert.equal(api.validateRoomState(pending), pending);
  const reveal = {...full, phase: 'reveal', result: {culpritId: 'suspect-1', outcome: 'partial',
    votes: [{playerId: 'agent-1', suspectId: null, correct: false}], solution: {motive: 'Synthetic'}}};
  assert.equal(api.validateRoomState(reveal), reveal);
  for (const mutate of mutations) {
    const broken = structuredClone(full); mutate(broken);
    assert.throws(() => api.validateRoomState(broken), /incomplete response/);
    assert.throws(() => api.validateRoomEntry({code: broken.code, playerId: broken.me.id, state: broken}), /incomplete response/);
  }
});

test('successful polling explicitly reports unchanged 204 and validated 200 responses', async t => {
  const source = snapshot(), events = [];
  stubFetch(t, [{status: 204}, {status: 200, body: snapshot({version: 5})}]);
  const loop = api.pollLoop({getState: () => source, isHidden: () => false,
    onState: next => events.push(['state', next.version]), onSuccess: (origin, status) => events.push(['success', origin, status])});
  t.after(() => loop.stop());
  await loop.now(); await loop.now();
  assert.deepEqual(events, [['success', source, 204], ['state', 5], ['success', source, 200]]);
});
test('failed, malformed, unexpected or unapplied poll responses never report recovery', async t => {
  const source = snapshot(), successes = [], failures = [];
  stubFetch(t, [new TypeError('Offline'), {status: 503, body: {error: 'Unavailable'}},
    {status: 200, body: null}, {status: 200, body: {}}, {status: 201, body: snapshot()}, {status: 200, body: snapshot()}]);
  const loop = api.pollLoop({getState: () => source, isHidden: () => false,
    onState: () => { throw new Error('Synthetic render failure'); }, onSuccess: (...args) => successes.push(args), onError: error => failures.push(error)});
  t.after(() => loop.stop());
  for (let i = 0; i < 6; i++) await loop.now();
  assert.deepEqual(successes, []);
  assert.equal(failures.length, 6);
});
test('a skipped poll reports no success and a delayed success retains the originating room', async t => {
  let active = null, resolve;
  const original = globalThis.fetch, successes = [];
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  t.after(() => { globalThis.fetch = original; });
  const loop = api.pollLoop({getState: () => active, onState: () => {}, isHidden: () => false,
    onSuccess: (origin, status) => successes.push({origin, status})});
  t.after(() => loop.stop());
  await loop.now(); assert.deepEqual(successes, []);
  active = {...snapshot(), localEpoch: 1};
  const source = active, running = loop.now();
  active = {...snapshot({code: 'EFGH6789'}), localEpoch: 2};
  resolve(new Response(null, {status: 204})); await running;
  assert.deepEqual(successes, [{origin: source, status: 204}]);
  assert.notEqual(successes[0].origin.localEpoch, active.localEpoch);
});
