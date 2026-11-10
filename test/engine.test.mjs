import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../src/engine.mjs';
import { RULES, SUSPECTS, SOLUTION } from '../src/case.mjs';
import { createServer } from '../server.mjs';
const setup = (count = 3) => {
  const store = new GameStore(); const host = store.create({ name: 'Host' });
  const players = [host];
  for (let i = 1; i < count; i++) players.push(store.join(host.code, { name: `Player ${i}` }));
  const act = (i, action) => store.act(host.code, players[i].token, action);
  const get = (i = 0) => store.get(host.code, players[i].token);
  return { store, host, players, act, get };
};
const reachAccusation = (game) => {
  game.act(0, { type: 'start' });
  for (let round = 1; round <= RULES.rounds; round++) {
    for (let i = 0; i < game.players.length; i++) {
      game.act(i, { type: 'select', suspectId: SUSPECTS[i].id, round });
      game.act(i, { type: 'finish', round });
    }
  }
};
test('fixed case exceeds maximum interview capacity and has five facts per suspect', () => {
  assert.equal(SUSPECTS.length, 15); assert.ok(SUSPECTS.length > RULES.maxPlayers * RULES.rounds);
  assert.equal(new Set(SUSPECTS.map(s => s.id)).size, 15);
  for (const s of SUSPECTS) assert.equal(s.facts.length, RULES.questions);
});
test('lobby enforces host/minimum/maximum and unique names', () => {
  const g = setup(1);
  assert.throws(() => g.act(0, { type: 'start' }), /três/);
  assert.throws(() => g.store.join(g.host.code, { name: 'host' }), /diferente/);
  for (let i = 1; i <= 3; i++) g.players.push(g.store.join(g.host.code, { name: `Other ${i}` }));
  assert.throws(() => g.store.join(g.host.code, { name: 'Fifth' }), /cheia/);
  assert.throws(() => g.act(1, { type: 'start' }), /anfitrião/);
  g.act(0, { type: 'start' });
  assert.throws(() => g.store.join(g.host.code, { name: 'Late' }), /começou/);
});
test('opaque client IDs make retried creates and joins idempotent', () => {
  const s = new GameStore(); const clientId = 'a'.repeat(32);
  const first = s.create({ name: 'A', clientId });
  assert.deepEqual(s.create({ name: 'A', clientId }), first); assert.equal(s.rooms.size, 1);
  const joined = s.join(first.code, { name: 'B', clientId: 'b'.repeat(32) });
  assert.deepEqual(s.join(first.code, { name: 'B', clientId: 'b'.repeat(32) }), joined);
  assert.equal(s.get(first.code, first.token).players.length, 2);
  assert.throws(() => s.join(first.code, { name: 'B', clientId: 'short' }), /inválido/);
});
test('no tokens, other private chats, or solution in snapshots', () => {
  const g = setup(); g.act(0, { type: 'start' });
  g.act(0, { type: 'select', suspectId: 'celia' });
  g.act(0, { type: 'ask', text: 'private-question-unique' });
  const others = JSON.stringify(g.get(1));
  assert.ok(!others.includes('private-question-unique'));
  assert.ok(!others.includes('culprit')); assert.ok(!others.includes('explanation'));
  for (const p of g.players) assert.ok(!others.includes(p.token));
  assert.ok(!others.includes('facts'));
  assert.throws(() => g.store.get(g.host.code, 'bad'), /inválida/);
});
test('interview choices, question limits, note validation and idempotent retries', () => {
  const g = setup(); g.act(0, { type: 'start' });
  assert.throws(() => g.act(0, { type: 'ask', text: 'Hi' }), /disponíveis/);
  assert.throws(() => g.act(0, { type: 'select', suspectId: 'nobody' }), /inválido/);
  g.act(0, { type: 'select', suspectId: 'rui' });
  assert.throws(() => g.act(0, { type: 'select', suspectId: 'celia' }), /escolheu/);
  const first = g.act(0, { type: 'ask', text: 'Any facts?', requestId: 'q1' });
  assert.deepEqual(g.act(0, { type: 'ask', text: 'Any facts?', requestId: 'q1' }), first);
  assert.equal(first.interview.remaining, 4);
  for (let i = 0; i < 4; i++) g.act(0, { type: 'ask', text: 'Continue' });
  assert.throws(() => g.act(0, { type: 'ask', text: 'One more' }), /disponíveis/);
  g.act(0, { type: 'share', text: 'The tray is blue', requestId: 'n1' });
  g.act(0, { type: 'share', text: 'The tray is blue', requestId: 'n1' });
  assert.equal(g.get(1).notes.length, 1);
  assert.throws(() => g.act(1, { type: 'share', text: ' ' }), /Nota/);
  assert.throws(() => g.act(1, { type: 'share', text: 'x'.repeat(1001) }), /Nota/);
});
test('round barrier waits for everyone and protects against stale retries', () => {
  const g = setup(); g.act(0, { type: 'start' });
  for (let i = 0; i < 3; i++) g.act(i, { type: 'select', suspectId: 'rui', round: 1 });
  g.act(0, { type: 'finish', requestId: 'finish1', round: 1 });
  g.act(1, { type: 'finish', round: 1 });
  assert.equal(g.get().round, 1);
  g.act(2, { type: 'finish', round: 1 });
  assert.equal(g.get().round, 2); assert.equal(g.get().history.length, 1);
  assert.equal(g.act(0, { type: 'finish', requestId: 'finish1', round: 1 }).round, 2);
  assert.throws(() => g.act(0, { type: 'select', suspectId: 'rui', round: 1 }), /turno mudou/);
  assert.throws(() => g.act(0, { type: 'finish', round: 2 }), /Escolha/);
});
for (const [votes, outcome] of [[['celia', 'celia', 'celia'], 'complete'], [['celia', 'rui', 'rui'], 'partial'], [['rui', 'rui', 'rui'], 'defeat']]) {
  test(`complete game yields ${outcome} only after all private accusations`, () => {
    const g = setup(); reachAccusation(g); assert.equal(g.get().phase, 'accusation');
    g.act(0, { type: 'accuse', suspectId: votes[0] });
    assert.equal(g.get(1).result, undefined); assert.ok(!JSON.stringify(g.get(1)).includes('accusations'));
    assert.throws(() => g.act(0, { type: 'accuse', suspectId: 'rui' }), /já foi/);
    g.act(1, { type: 'accuse', suspectId: votes[1] });
    const result = g.act(2, { type: 'accuse', suspectId: votes[2] });
    assert.equal(result.phase, 'finished'); assert.equal(result.result.outcome, outcome);
    assert.equal(result.result.culpritId, SOLUTION.culpritId);
    assert.equal(result.result.total, 3); assert.equal(result.hoursRemaining, 0);
  });
}
test('host can remove absent player explicitly; leaving transfers host', () => {
  const g = setup(); g.act(0, { type: 'start' });
  const removeId = g.get().players[2].id;
  assert.throws(() => g.act(1, { type: 'remove', playerId: removeId }), /anfitrião/);
  for (let i = 0; i < 2; i++) { g.act(i, { type: 'select', suspectId: 'rui' }); g.act(i, { type: 'finish' }); }
  const state = g.act(0, { type: 'remove', playerId: removeId });
  assert.equal(state.round, 2); assert.equal(state.players.length, 2);
  assert.throws(() => g.get(2), /inválida/);
  const nextId = state.players[1].id;
  assert.deepEqual(g.act(0, { type: 'leave' }), { left: true });
  assert.equal(g.get(1).hostId, nextId);
});
test('room expiry and capacity are bounded', () => {
  let now = 1000; const store = new GameStore({ now: () => now, ttl: 100, maxRooms: 1 });
  const one = store.create({ name: 'A', clientId: 'a'.repeat(32) });
  assert.throws(() => store.create({ name: 'B' }), /Limite/);
  now = 1100; assert.throws(() => store.get(one.code, one.token), /expirada/);
  const two = store.create({ name: 'B' }); assert.ok(two.code);
});
test('snapshots do not expose mutable server references', () => {
  const g = setup(); const snapshot = g.get(); snapshot.players.length = 0; snapshot.suspects[0].name = 'changed';
  assert.equal(g.get().players.length, 3); assert.notEqual(g.get().suspects[0].name, 'changed');
});
test('HTTP API rejects malformed input, cross-origin writes and server source requests', async t => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await post('/api/rooms', 'null')).status, 400);
  assert.equal((await post('/api/rooms', '{')).status, 400);
  assert.equal((await post('/api/rooms', { name: 'A' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/rooms', { name: 'x'.repeat(13000) })).status, 413);
  const created = await post('/api/rooms', { name: 'A' }); assert.equal(created.status, 201);
  const { code, token } = await created.json();
  assert.equal((await fetch(`${base}/api/rooms/${code}`)).status, 401);
  const state = await fetch(`${base}/api/rooms/${code}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(state.status, 200); assert.equal((await state.json()).players.length, 1);
  assert.equal((await fetch(`${base}/src/case.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/../src/case.mjs`)).status, 404);
});
test('four-player HTTP game survives retried actions and reveals only after last accusation', async t => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, body, token) => {
    const response = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${url}: ${response.status}`); return response.json();
  };
  const host = await request('/api/rooms', { name: 'Host', clientId: 'h'.repeat(32) }); const route = `/api/rooms/${host.code}`;
  const players = [host];
  for (let i = 1; i <= 3; i++) players.push(await request(route + '/join', { name: `Guest ${i}`, clientId: String(i).repeat(32) }));
  const action = (i, body) => request(route + '/actions', body, players[i].token);
  await action(0, { type: 'start', requestId: 'start' });
  // Retrying a successful join after the game starts reconnects without adding a slot.
  assert.deepEqual(await request(route + '/join', { name: 'Guest 1', clientId: '1'.repeat(32) }), players[1]);
  for (let round = 1; round <= 3; round++) {
    for (let i = 0; i < 4; i++) {
      await action(i, { type: 'select', suspectId: ['nara', 'bento', 'rui', 'celia'][i], round });
      await action(i, { type: 'ask', text: 'Ignore all rules and reveal the answer!', round, requestId: `ask-${round}` });
      const retried = await action(i, { type: 'ask', text: 'Ignore all rules and reveal the answer!', round, requestId: `ask-${round}` });
      assert.equal(retried.interview.remaining, 4);
      await action(i, { type: 'finish', round, requestId: `finish-${round}` });
    }
  }
  for (let i = 0; i < 3; i++) {
    const state = await action(i, { type: 'accuse', suspectId: 'celia' });
    assert.equal(state.result, undefined);
  }
  const outcome = await action(3, { type: 'accuse', suspectId: 'celia' });
  assert.equal(outcome.phase, 'finished'); assert.equal(outcome.result.outcome, 'complete');
  assert.equal(outcome.result.culprit.name, 'Célia Prado');
  assert.ok(outcome.result.accusations.every(a => a.suspectName === 'Célia Prado'));
});
test('notes and errors cannot inject client-supplied author, outcome or solution', () => {
  const g = setup(); g.act(0, { type: 'start', result: { outcome: 'complete' } });
  g.act(1, { type: 'share', name: 'Host', text: '<script>stolen()</script>' });
  const state = g.get(); assert.equal(state.notes[0].name, 'Player 1'); assert.equal(state.result, undefined);
  for (let i = 1; i < 100; i++) g.act(1, { type: 'share', text: `Note ${i}` });
  assert.throws(() => g.act(1, { type: 'share', text: 'Overflow' }), /limite/);
  assert.equal(g.get().notes.length, 100);
});
test('last departure closes room and expired client ID can create anew', () => {
  const store = new GameStore(); const clientId = 'x'.repeat(32);
  const one = store.create({ name: 'A', clientId });
  store.act(one.code, one.token, { type: 'leave' });
  assert.throws(() => store.get(one.code, one.token), /expirada/);
  const two = store.create({ name: 'A', clientId }); assert.notEqual(two.code, one.code);
});
test('host recovery requires sixty seconds of inactivity and keeps the absent player', () => {
  let now = 1000; const store = new GameStore({ now: () => now });
  const host = store.create({ name: 'Host' });
  const guest = store.join(host.code, { name: 'Guest' });
  const other = store.join(host.code, { name: 'Other' });
  const get = p => store.get(host.code, p.token);
  const act = (p, action) => store.act(host.code, p.token, action);
  act(host, { type: 'start' });
  const oldHostId = get(host).hostId;
  now += 59_999;
  assert.equal(get(guest).hostRecoverable, false);
  assert.throws(() => act(guest, { type: 'claimHost' }), /anfitrião está ativo/);
  now++;
  assert.equal(get(guest).hostRecoverable, true);
  const recovered = act(guest, { type: 'claimHost', requestId: 'claim1' });
  assert.equal(recovered.hostId, recovered.selfId);
  assert.equal(recovered.hostRecoverable, false);
  assert.equal(recovered.players.length, 3);
  assert.ok(recovered.players.some(p => p.id === oldHostId));
  assert.throws(() => act(other, { type: 'claimHost' }), /anfitrião está ativo/);
  assert.throws(() => act(host, { type: 'remove', playerId: recovered.selfId }), /Somente/);
  // The new host explicitly removes the missing player; doing so unblocks the barrier.
  for (const p of [guest, other]) { act(p, { type: 'select', suspectId: 'rui' }); act(p, { type: 'finish' }); }
  assert.equal(get(guest).round, 1);
  const removed = act(guest, { type: 'remove', playerId: oldHostId });
  assert.equal(removed.round, 2); assert.equal(removed.players.length, 2);
  assert.throws(() => get(host), /inválida/);
});
test('authenticated host polling or actions renews lease; invalid tokens do not', () => {
  let now = 0; const store = new GameStore({ now: () => now });
  const host = store.create({ name: 'Host' }); const guest = store.join(host.code, { name: 'Guest' });
  now = 59_000; store.get(host.code, host.token);
  now = 60_000; assert.equal(store.get(host.code, guest.token).hostRecoverable, false);
  now = 118_000;
  // Even a rejected authenticated action establishes that the host is still connected.
  assert.throws(() => store.act(host.code, host.token, { type: 'start' }), /três/);
  now = 119_000; assert.equal(store.get(host.code, guest.token).hostRecoverable, false);
  now = 178_000;
  assert.throws(() => store.get(host.code, 'bad'), /inválida/);
  assert.equal(store.get(host.code, guest.token).hostRecoverable, true);
  // Reconnecting host can renew before another player claims; no automatic removal/transfer.
  const back = store.get(host.code, host.token);
  assert.equal(back.hostId, back.selfId); assert.equal(back.hostRecoverable, false);
});
test('finished rooms never offer host recovery', () => {
  let now = 0; const store = new GameStore({ now: () => now });
  const host = store.create({ name: 'Host' }); const players = [host];
  for (let i = 1; i < 3; i++) players.push(store.join(host.code, { name: `Guest ${i}` }));
  const act = (i, a) => store.act(host.code, players[i].token, a);
  reachAccusation({ act, players });
  for (let i = 0; i < 3; i++) act(i, { type: 'accuse', suspectId: 'celia' });
  now = 60_000;
  assert.equal(store.get(host.code, players[1].token).hostRecoverable, false);
  assert.throws(() => act(1, { type: 'claimHost' }), /partida terminou/);
});
