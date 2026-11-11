import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GameService} from '../server/game.mjs';
import {TRAIN_CASE, CASES} from './fixtures/case.mjs';
import {renderLanding, renderLobby, renderPick} from '../public/views.js';
import {createDocument} from './helpers/fake-dom.mjs';

function gameState() {
  const game = new GameService({caseData: TRAIN_CASE, catalog: CASES});
  const host = game.create('Ada', TRAIN_CASE.id, randomUUID());
  return {game, host, state: game.view(host.code, host.token)};
}

for (const mode of ['canonical', 'ai', undefined, 'unrecognised']) {
  test(`entry and lobby describe the actual ${mode ?? 'unknown'} interview mode`, () => {
    const {state} = gameState();
    const local = {cases: CASES, dialogueMode: mode};
    for (const html of [renderLanding(null, local), renderLobby(state, local)]) {
      const text = createDocument(html).querySelector('.ai-notice').textContent;
      if (mode === 'canonical') {
        assert.match(text, /authored replies/i);
        assert.match(text, /rephrasing may repeat an answer/);
        assert.doesNotMatch(text, /voiced by AI/);
      } else if (mode === 'ai') {
        assert.match(text, /voiced by AI/);
        assert.match(text, /Don't type personal information/);
        assert.match(text, /Authored replies take over if AI is unavailable/);
      } else {
        assert.match(text, /mode is loading/);
        assert.doesNotMatch(text, /voiced by AI|use authored replies/);
      }
    }
  });
}

test('both entry routes explain the table requirements before the form', () => {
  for (const entry of ['create', 'join']) {
    const html = renderLanding(null, {entry, cases: CASES, dialogueMode: 'canonical'});
    assert.match(html, /3–4 players · one phone each/);
    assert.match(html, /compare your discoveries out loud/);
    assert.ok(html.indexOf('one phone each') < html.indexOf('<form'));
  }
});

test('a selected dossier shows only that suspect public profile without committing a turn', () => {
  const {game, host, state} = gameState();
  const before = JSON.stringify(state);
  const chosen = state.suspects[1];
  const doc = createDocument(renderPick(state, {selected: chosen.id}));
  const dossier = doc.getElementById('suspect-dossier');
  assert.equal(dossier.getAttribute('tabindex'), '-1');
  assert.equal(dossier.getAttribute('aria-labelledby'), 'dossier-name');
  assert.equal(dossier.querySelector('h2').textContent, chosen.name);
  assert.match(dossier.textContent, /Synthetic dossier for development/);
  assert.match(dossier.textContent, /Starting the chat commits this turn/);
  assert.doesNotMatch(doc.body.textContent, /Synthetic private brief|Synthetic motive used/);
  assert.equal(doc.getElementById(`suspect-choice-${chosen.id}`).getAttribute('aria-pressed'), 'true');
  assert.equal(JSON.stringify(game.view(host.code, host.token)), before);
  assert.equal(createDocument(renderPick(state, {selected: null})).getElementById('suspect-dossier'), null);
});

test('selected dossier content is escaped and never renders private brief fields', () => {
  const {state} = gameState();
  state.suspects[0] = {...state.suspects[0], name: '<b>Hostile name</b>', profile: '<img src=x onerror=alert(1)> Public profile', brief: 'PRIVATE-BRIEF-SENTINEL'};
  const html = renderPick(state, {selected: state.suspects[0].id});
  const doc = createDocument(html), dossier = doc.getElementById('suspect-dossier');
  assert.equal(dossier.querySelector('h2').textContent, '<b>Hostile name</b>');
  assert.match(dossier.textContent, /<img src=x onerror=alert\(1\)> Public profile/);
  assert.equal(dossier.querySelector('img'), null);
  assert.doesNotMatch(html, /PRIVATE-BRIEF-SENTINEL/);
});
