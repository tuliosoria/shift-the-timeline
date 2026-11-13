import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GameService} from '../server/game.mjs';
import {TRAIN_CASE, CASES} from './fixtures/case.mjs';
import {renderPick, renderAccuse} from '../public/views.js';
import {createDocument} from './helpers/fake-dom.mjs';

for (const [render, action] of [[renderPick, 'question'], [renderAccuse, 'summon']]) {
  function state() {
    const game = new GameService({caseData: TRAIN_CASE, catalog: CASES});
    const room = game.create('Ada', TRAIN_CASE.id, randomUUID());
    return game.view(room.code, room.token);
  }
  test(`${action}: review and the only commit control belong to the chosen dossier before other cards`, () => {
    const s = state(), chosen = s.suspects[14], before = JSON.stringify(s);
    const html = render(s, {selected: chosen.id}), doc = createDocument(html), dossier = doc.getElementById('suspect-dossier');
    const commit = dossier.querySelector(`[data-action=${action}]`);
    assert.ok(commit); assert.equal(commit.disabled, false);
    assert.equal(doc.querySelectorAll(`[data-action=${action}]`).length, 1);
    assert.equal(dossier.getAttribute('aria-labelledby'), 'dossier-name');
    assert.match(commit.textContent, new RegExp(chosen.name));
    assert.ok(html.indexOf('id="selected-suspect-file"') < html.indexOf(`data-action="${action}"`));
    assert.ok(html.indexOf(`data-action="${action}"`) < html.indexOf('class="grid"'));
    assert.match(dossier.textContent, action === 'summon' ? /This cannot be undone/ : /You get 3 questions/);
    assert.equal(doc.querySelectorAll('.card').length, 15);
    assert.equal(JSON.stringify(s), before, 'rendering never commits a choice');
  });
  test(`${action}: empty and stale selections keep exactly one disabled action`, () => {
    for (const selected of [null, 'missing']) {
      const doc = createDocument(render(state(), {selected}));
      assert.equal(doc.getElementById('suspect-dossier'), null);
      assert.equal(doc.querySelectorAll(`[data-action=${action}]`).length, 1);
      const commit = doc.querySelector(`[data-action=${action}]`);
      assert.equal(commit.disabled, true); assert.equal(commit.dataset.locked, 'true');
    }
  });
  test(`${action}: full selected names are escaped in commit controls and private fields stay private`, () => {
    const s = state(); s.suspects[0] = {...s.suspects[0], name: '<img src=x onerror=alert(1)>', brief: 'PRIVATE-SENTINEL'};
    const doc = createDocument(render(s, {selected: s.suspects[0].id}));
    const commit = doc.querySelector(`[data-action=${action}]`);
    assert.match(commit.textContent, /<img src=x onerror=alert\(1\)>/);
    assert.equal(commit.querySelector('img'), null);
    assert.doesNotMatch(doc.body.textContent, /PRIVATE-SENTINEL/);
  });
}
