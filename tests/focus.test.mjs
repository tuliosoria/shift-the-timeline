import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument} from './helpers/fake-dom.mjs';
import {captureFocus, restoreFocus} from '../public/focus.js';

function setup(html) {
  const document = createDocument(`<main id="main" tabindex="-1">${html}</main><dialog id="dialog"><button id="cancel">Cancel</button></dialog>`);
  return {document, root: document.getElementById('main')};
}
test('semantic action survives replacement and reordering, not control position or label', () => {
  const {document, root} = setup('<button data-action="copy">Copy</button><button data-action="switch">Switch</button>');
  root.querySelector('[data-action=switch]').focus();
  const saved = captureFocus(root);
  root.innerHTML = '<button data-action="new">New</button><button data-action="switch">Updated label</button><button data-action="copy">Copy</button>';
  restoreFocus(root, saved);
  assert.equal(document.activeElement.dataset.action, 'switch');
});
test('replaced input recovers selection; retained input is left untouched', () => {
  const {document, root} = setup('<input id="name" value="Arthur">');
  const input = root.querySelector('input'); input.focus(); input.setSelectionRange(1, 4);
  const saved = captureFocus(root);
  input.setSelectionRange(2, 3);
  restoreFocus(root, saved);
  assert.equal(input.selectionStart, 2, 'retained editing is not rewound');
  root.innerHTML = '<input id="name" value="Arthur">';
  restoreFocus(root, saved);
  assert.equal(document.activeElement.id, 'name');
  assert.deepEqual([document.activeElement.selectionStart, document.activeElement.selectionEnd], [1, 4]);
});
test('missing, disabled, hidden, ambiguous and different-screen controls use safe fallback', () => {
  for (const [html, match] of [
    ['<button data-action="other">Other</button>', true],
    ['<button data-action="copy" disabled>Copy</button>', true],
    ['<div hidden><button data-action="copy">Copy</button></div>', true],
    ['<div inert><button data-action="copy">Copy</button></div>', true],
    ['<button data-action="copy">Copy</button><button data-action="copy">Copy</button>', true],
    ['<button data-action="copy">Copy</button>', false],
  ]) {
    const {document, root} = setup('<button data-action="copy">Copy</button>');
    root.querySelector('button').focus(); const saved = captureFocus(root);
    root.innerHTML = html; restoreFocus(root, saved, {fallback: root, match});
    assert.equal(document.activeElement, root, html);
  }
});
test('never steal focus from a new deliberate target or an open dialog', () => {
  for (const modal of [false, true]) {
    const {document, root} = setup('<button data-action="copy">Copy</button>');
    root.querySelector('button').focus(); const saved = captureFocus(root);
    root.innerHTML = '<input id="new">';
    const next = document.getElementById(modal ? 'cancel' : 'new');
    if (modal) document.getElementById('dialog').open = true;
    next.focus(); restoreFocus(root, saved, {fallback: root});
    assert.equal(document.activeElement, next);
    if (modal) assert.equal(captureFocus(root), null);
  }
});
test('a closed dialog can return to the equivalent replaced opener', () => {
  const {document, root} = setup('<button data-action="switch">Switch</button>');
  root.querySelector('button').focus(); const saved = captureFocus(root);
  document.getElementById('cancel').focus();
  root.innerHTML = '<button data-action="switch">Switch</button>';
  restoreFocus(root, saved, {fallback: root});
  assert.equal(document.activeElement.dataset.action, 'switch');
});
test('identity values are compared literally, never interpolated into selectors', () => {
  const {document, root} = setup('<button id="odd&quot;][id=other">Choice</button>');
  root.querySelector('button').focus(); const saved = captureFocus(root);
  root.innerHTML = '<button id="other">Wrong</button><button id="odd&quot;][id=other">Choice</button>';
  restoreFocus(root, saved);
  assert.equal(document.activeElement.id, 'odd"][id=other');
});
