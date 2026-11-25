import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {renderLanding} from '../public/views.js';

test('failed startup explains the problem, offers a retry, and locks joining until connected', () => {
  const landing = renderLanding(null, {startup: 'failed', entry: 'join'});
  assert.match(landing, /role="alert"[^>]*>Could not connect to the Bureau/);
  assert.match(landing, /data-action="retry-startup"[^>]*>Retry connection/);
  assert.match(landing, /data-locked="true"[^>]*>Join the table/);
});

test('without JavaScript, the shell does not claim that it is connecting', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<noscript>[\s\S]*?SHIFT needs JavaScript to play/);
  assert.doesNotMatch(html, /<main[^>]*><p[^>]*>Connecting to the Bureau/);
});
