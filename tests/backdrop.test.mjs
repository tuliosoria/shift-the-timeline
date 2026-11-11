import test from 'node:test';
import assert from 'node:assert/strict';
const backdrop = await import('../public/backdrop.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

function fakeDocument() {
  const writes = [], listeners = {};
  const video = {
    paused: true, _src: '', _poster: '',
    get src() { return this._src; }, set src(v) { writes.push(['src', v]); this._src = v; },
    get poster() { return this._poster; }, set poster(v) { writes.push(['poster', v]); this._poster = v; },
    removeAttribute(name) { writes.push(['remove', name]); if (name === 'src') this._src = ''; },
    load() { writes.push(['load']); },
    play() { writes.push(['play']); this.paused = false; return Promise.resolve(); },
    pause() { writes.push(['pause']); this.paused = true; },
  };
  const doc = {
    hidden: false,
    getElementById: id => id === 'backdrop' ? video : null,
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    fire(type) { for (const fn of listeners[type] ?? []) fn(); },
  };
  return {doc, video, writes};
}
const media = reduce => query => ({matches: reduce && query === '(prefers-reduced-motion: reduce)'});

test('screens map to the three films', () => {
  assert.equal(typeof backdrop.createBackdrop, 'function');
  assert.deepEqual(backdrop.FILMS, {landing:'train', lobby:'train', briefing:'train', pick:'corridor', chat:'corridor', waiting:'pocket-watch', transition:'pocket-watch', accuse:'pocket-watch', reveal:'pocket-watch'});
});
test('reduced motion sets poster only, no src', () => {
  const {doc, video, writes} = fakeDocument();
  backdrop.createBackdrop({document: doc, matchMedia: media(true)}).setScene('pick');
  assert.equal(video.poster, '/assets/films/corridor.webp');
  assert.equal(video.src, '');
  assert.ok(!writes.some(([op]) => op === 'src' || op === 'play'));
});
test('a new film swaps src and poster and plays', () => {
  const {doc, video, writes} = fakeDocument();
  backdrop.createBackdrop({document: doc, matchMedia: media(false)}).setScene('landing');
  assert.equal(video.src, '/assets/films/train.mp4');
  assert.equal(video.poster, '/assets/films/train.webp');
  assert.ok(writes.some(([op]) => op === 'play'));
});
test('same film keeps element untouched', () => {
  const {doc, writes} = fakeDocument();
  const b = backdrop.createBackdrop({document: doc, matchMedia: media(false)});
  b.setScene('pick');
  const before = writes.length;
  b.setScene('chat');
  assert.equal(writes.length, before);
});
test('hidden pauses and visible resumes', () => {
  const {doc, video} = fakeDocument();
  backdrop.createBackdrop({document: doc, matchMedia: media(false)}).setScene('reveal');
  doc.hidden = true; doc.fire('visibilitychange');
  assert.equal(video.paused, true);
  doc.hidden = false; doc.fire('visibilitychange');
  assert.equal(video.paused, false);
});
