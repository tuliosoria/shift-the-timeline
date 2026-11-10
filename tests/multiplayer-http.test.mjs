import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from '../server/http.mjs';
import {createApi} from '../server/api.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {Sessions} from '../server/sessions.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {TRAIN_CASE, CASES} from './fixtures/case.mjs';

for (const count of [3, 4]) test(`${count} isolated HTTP clients finish a private canonical game with safe retries`, async t => {
  const store = new MemoryStore();
  let api;
  const server = createServer({api: (...args) => api(...args), origin: 'http://127.0.0.1'});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeIdleConnections();}));
  const origin = `http://127.0.0.1:${server.address().port}`;
  api = createApi({
    game: new DurableGame({store, caseData: TRAIN_CASE, catalog: CASES}),
    sessions: new Sessions({store, secure: false}), allowedOrigin: origin, rateLimit: async () => {},
  });
  function client() {
    let cookie;
    return async (path, body) => {
      const response = await fetch(origin + path, {
        method: body ? 'POST' : 'GET',
        headers: {...(cookie ? {cookie} : {}), ...(body ? {origin, 'content-type': 'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      assert.match(response.headers.get('cache-control'), /no-store/);
      return {status: response.status, body: response.status === 204 ? null : await response.json()};
    };
  }
  function privateProjection(state, ownQuestion) {
    assert.equal(state.result, undefined);
    assert.ok(!JSON.stringify(state).includes(TRAIN_CASE.solution.motive));
    assert.ok(!Object.hasOwn(state.case, 'culpritId'));
    assert.ok(!Object.hasOwn(state.case, 'solution'));
    assert.ok(state.players.every(p => !Object.hasOwn(p, 'interviews') && !Object.hasOwn(p, 'vote') && !Object.hasOwn(p, 'token')));
    if (ownQuestion) assert.ok(JSON.stringify(state.me).includes(ownQuestion));
  }
  const players = Array.from({length: count}, client), outsider = client();
  for (const call of [...players, outsider]) assert.equal((await call('/api/session', {})).status, 201);
  const created = await players[0]('/api/rooms', {name: 'Agent 0', caseId: 'demo', id: randomUUID()});
  assert.equal(created.status, 201);
  const code = created.body.code;
  for (let i = 1; i < count; i++) {
    const joined = await players[i](`/api/rooms/${code}/join`, {name: `Agent ${i}`, id: randomUUID()});
    assert.equal(joined.status, 200);
  }
  assert.equal((await outsider(`/api/rooms/${code}`)).status, 401);
  const action = async (index, type, extra = {}, requestId = randomUUID()) => {
    const response = await players[index](`/api/rooms/${code}/actions`, {id: requestId, type, ...extra});
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  };
  if (count === 4) assert.equal((await outsider(`/api/rooms/${code}/join`, {name: 'Fifth', id: randomUUID()})).status, 400);
  await action(0, 'start');
  assert.equal((await outsider(`/api/rooms/${code}/join`, {name: 'Late', id: randomUUID()})).status, 400);
  for (let round = 1; round <= 3; round++) {
    for (let i = 0; i < count; i++) {
      await action(i, 'select', {round, suspectId: `suspect-${i + 1}`});
      const question = `Private question from agent ${i} round ${round}`;
      const body = {round, question, topic: 'clue'};
      let state;
      if (round === 1 && i === 0) {
        const requestId = randomUUID();
        const responses = await Promise.all([action(i, 'ask', body, requestId), action(i, 'ask', body, requestId)]);
        for (const result of responses) assert.equal(result.me.interviews[0].messages.length, 1);
        state = responses[0];
      } else state = await action(i, 'ask', body);
      privateProjection(state, question);
      const other = (await players[(i + 1) % count](`/api/rooms/${code}`)).body;
      privateProjection(other);
      assert.ok(!JSON.stringify(other).includes(question));
      if (round === 1 && i === 0) {
        const message = state.me.interviews[0].messages[0];
        await action(i, 'share', {messageId: message.id});
        const shared = (await players[1](`/api/rooms/${code}`)).body;
        assert.equal(shared.board.length, 1);
        assert.equal(shared.board[0].text, message.answer);
        assert.ok(!JSON.stringify(shared).includes(question));
      }
      await action(i, 'end', {round});
    }
  }
  for (let i = 0; i < count; i++) {
    const state = await action(i, 'vote', {suspectId: count === 4 && i === count - 1 ? 'suspect-1' : 'suspect-0'});
    if (i < count - 1) {
      privateProjection(state);
      const waiting = (await players[count - 1](`/api/rooms/${code}`)).body;
      assert.equal(waiting.me.vote, null);
      privateProjection(waiting);
    }
  }
  for (const call of players) {
    const final = (await call(`/api/rooms/${code}`)).body;
    assert.equal(final.phase, 'reveal');
    assert.equal(final.result.outcome, count === 3 ? 'complete' : 'partial');
    assert.equal(final.result.innocentArrests, count === 3 ? 0 : 1);
    assert.equal(final.me.interviews.length, 3);
    assert.deepEqual(final.result.solution, TRAIN_CASE.solution);
    assert.equal((await call(`/api/rooms/${code}?since=${final.version}`)).status, 204);
  }
  assert.equal((await players[0]('/api/session/logout', {})).status, 200);
  assert.equal((await players[0](`/api/rooms/${code}`)).status, 401);
});
