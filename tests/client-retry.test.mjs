import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {MemoryStore} from '../server/storage/memory.mjs';
import {Sessions} from '../server/sessions.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {DomainError} from '../server/game.mjs';
import {createApi} from '../server/api.mjs';
import {TRAIN_CASE, CASES} from './fixtures/case.mjs';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const commands = source.slice(source.indexOf('async function command'), source.indexOf('function setBusy'));

test('rate limit after a lost committed response preserves the original question receipt', async () => {
  const store = new MemoryStore(), sessions = new Sessions({store, secure: false});
  const game = new DurableGame({store, caseData: TRAIN_CASE, catalog: CASES});
  const origin = 'http://shift.example';
  let limited = false;
  const api = createApi({game, sessions, allowedOrigin: origin, rateLimit: async () => {
    if (limited) throw new DomainError('Aguarde antes de tentar novamente.', 429);
  }});
  const request = (path, body, cookie) => new Request(origin + path, {
    method: 'POST', headers: {origin, 'content-type': 'application/json', ...(cookie ? {cookie} : {})},
    body: JSON.stringify(body),
  });
  const identities = [];
  for (let i = 0; i < 3; i++) {
    const bootstrap = await api(request('/api/session', {}));
    assert.equal(bootstrap.status, 201);
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    identities.push({cookie, hash: (await sessions.resolve(cookie)).hash});
  }
  const joined = await game.create(identities[0].hash, 'Host', 'demo', randomUUID());
  for (let i = 1; i < 3; i++) await game.join(joined.code, identities[i].hash, `Agent ${i}`, randomUUID());
  await game.act(joined.code, identities[0].hash, {type: 'start', id: randomUUID()});
  await game.act(joined.code, identities[0].hash, {type: 'select', round: 1, suspectId: 'suspect-1', id: randomUUID()});
  const saved = new Map(), responses = [], field = {value: 'Uma pergunta única'};
  const body = {type: 'ask', round: 1, question: field.value, topic: 'clue', id: randomUUID()};
  const sandbox = {
    pending: null, busy: false, body,
    storage: {set(key, value) {saved.set(key, JSON.stringify(value));}, remove(key) {saved.delete(key);}},
    setBusy() {}, render() {}, notice() {}, $: selector => selector === '#notice' ? {textContent: ''} : field,
    fetchJson: async (path, options) => {
      const response = await api(request(path, options.body, identities[0].cookie));
      const data = await response.json();
      responses.push({status: response.status, id: options.body.id});
      if (responses.length === 1 && response.ok) throw new Error('Committed response was lost');
      if (!response.ok) {const error = new Error(data.error); error.status = response.status; throw error;}
      return data;
    },
  };
  vm.runInNewContext(commands + `; result=command('/api/rooms/${joined.code}/actions',body)`, sandbox);
  assert.equal(await sandbox.result, false);
  assert.equal((await game.view(joined.code, identities[0].hash)).me.interviews[0].messages.length, 1);
  limited = true;
  vm.runInNewContext('result=runPending()', sandbox);
  assert.equal(await sandbox.result, false);
  assert.equal(sandbox.pending?.body.id, body.id);
  assert.equal(JSON.parse(saved.get('shift-pending')).body.id, body.id);
  assert.equal(field.value, body.question);
  limited = false;
  vm.runInNewContext('result=runPending()', sandbox);
  assert.equal(await sandbox.result, true);
  assert.deepEqual(responses, [200, 429, 200].map(status => ({status, id: body.id})));
  assert.equal(sandbox.state.me.interviews[0].messages.length, 1);
  assert.equal(sandbox.pending, null);
  assert.equal(saved.has('shift-pending'), false);
  assert.equal(field.value, '');
});
test('a definitive validation rejection clears the pending request and keeps its draft', async () => {
  const saved = new Map(), field = {value: 'Rascunho inválido'}, body = {type: 'ask', id: 'invalid-request', question: 'Rascunho inválido'};
  const sandbox = {
    pending: null, busy: false, body,
    storage: {set(key, value) {saved.set(key, JSON.stringify(value));}, remove(key) {saved.delete(key);}},
    setBusy() {}, render() {}, notice() {}, $: selector => selector === '#notice' ? {textContent: ''} : field,
    fetchJson: async () => {const error = new Error('Pergunta inválida.'); error.status = 400; throw error;},
  };
  vm.runInNewContext(commands + "; result=command('/api/test',body)", sandbox);
  assert.equal(await sandbox.result, false);
  assert.equal(sandbox.pending, null);
  assert.equal(sandbox.busy, false);
  assert.equal(saved.has('shift-pending'), false);
  assert.equal(field.value, body.question);
});
