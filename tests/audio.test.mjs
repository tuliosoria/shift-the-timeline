import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../public/audio.js').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const tick = () => new Promise(r => setImmediate(r));
function setup(saved, {rejectPlay = false, rejectFetch = false} = {}) {
  const listeners = {}, requests = [], sources = [], gains = [], plays = [];
  const media = {src: '', preload: '', paused: true, addEventListener: (name, fn) => { listeners[name] = fn; },
    play() { plays.push(this.src); if (rejectPlay) return Promise.reject(Error('Not allowed')); this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }};
  const context = {state: 'running', destination: {}, currentTime: 0, resume: async () => {},
    createMediaElementSource: () => ({connect() {}}), createGain: () => { const g = {gain: {value: 1}, connect() {}}; gains.push(g); return g; },
    decodeAudioData: async bytes => bytes,
    createBufferSource: () => { const s = {connect() {}, start() { this.started = true; }, stop() { this.stopped = true; }}; sources.push(s); return s; }};
  const storage = {getItem: () => saved, setItem: (_, value) => { saved = value; }};
  assert.equal(typeof mod.createAudio, 'function', 'audio controller exists');
  const audio = mod.createAudio({createMedia: () => media, createContext: () => context, storage,
    fetch: async url => { requests.push(url); if (rejectFetch) throw Error('Offline'); return {ok: true, arrayBuffer: async () => new ArrayBuffer(4)}; }});
  return {audio, media, context, requests, sources, gains, plays, fire: name => listeners[name]?.(), saved: () => JSON.parse(saved)};
}
test('sound defaults on and remembered enabled survives reload', async () => {
  const s = setup(JSON.stringify({enabled: true, music: .2, effects: .4}));
  assert.equal(s.audio.settings.enabled, true); assert.equal(s.media.src, ''); assert.equal(s.requests.length, 0);
  s.audio.effect('click'); await tick(); assert.equal(s.plays.length, 0);
  await s.audio.setEnabled(true); await tick();
  assert.equal(s.media.src, mod.TRACKS[0].url); assert.equal(s.media.paused, false); assert.equal(s.requests.length, 3);
});
test('both tracks alternate forever without a second overlapping music player', async () => {
  const s = setup(); await s.audio.setEnabled(true);
  s.fire('ended'); await tick(); assert.equal(s.media.src, mod.TRACKS[1].url);
  s.fire('ended'); await tick(); assert.equal(s.media.src, mod.TRACKS[0].url);
  assert.equal(s.plays.length, 3);
});
test('music and effects volumes are independent gain nodes and zero means silent', async () => {
  const s = setup(); await s.audio.setEnabled(true); await tick();
  s.audio.setVolume('music', 0); assert.equal(s.gains[0].gain.value, 0);
  s.audio.setVolume('effects', .7); assert.equal(s.gains[1].gain.value, .7);
  s.audio.effect('send'); assert.equal(s.sources.length, 1);
  s.audio.setVolume('effects', 0); s.audio.effect('receive'); assert.equal(s.sources.length, 1);
  assert.equal(s.saved().music, 0); assert.equal(s.saved().effects, 0);
});
test('mute and hiding stop music and current effects; return resumes only if enabled', async () => {
  const s = setup(); await s.audio.setEnabled(true); await tick(); s.audio.effect('click');
  s.audio.setHidden(true); assert.equal(s.media.paused, true); assert.equal(s.sources[0].stopped, true);
  s.audio.effect('receive'); assert.equal(s.sources.length, 1);
  s.audio.setHidden(false); await tick(); assert.equal(s.media.paused, false);
  await s.audio.setEnabled(false); assert.equal(s.media.paused, true);
  s.audio.setHidden(true); s.audio.setHidden(false); assert.equal(s.media.paused, true);
});
test('play rejection preserves enabled preference and waits for interaction', async () => {
  const s = setup(null, {rejectPlay: true, rejectFetch: true});
  assert.equal(await s.audio.setEnabled(true), false); await tick();
  assert.equal(s.audio.settings.enabled, true); assert.equal(s.audio.settings.waiting, true); s.audio.effect('receive');
  assert.equal(s.sources.length, 0);
});
test('invalid settings clamp to safe defaults and blocked storage is harmless', async () => {
  const s = setup('{"music":9,"effects":-1}');
  assert.equal(s.audio.settings.music, .2); assert.equal(s.audio.settings.effects, .35);
  s.audio.setVolume('music', NaN); assert.equal(s.audio.settings.music, .2);
  const a = mod.createAudio({createMedia: () => s.media, createContext: () => {throw Error('unsupported');}, fetch: async () => {}, storage: {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}}});
  assert.equal(await a.setEnabled(true), false);
});
test('receive cue detects completed personal messages once, not baseline, polls or new rooms', () => {
  assert.equal(typeof mod.hasNewReply, 'function');
  const state = (code, status, id = 'm1') => ({code, me: {id: 'p', interviews: [{messages: [{id, status}]}]}});
  const pending = state('ROOM', 'pending'), done = state('ROOM', 'complete');
  assert.equal(mod.hasNewReply(null, done), false);
  assert.equal(mod.hasNewReply(pending, done), true);
  assert.equal(mod.hasNewReply(done, done), false);
  assert.equal(mod.hasNewReply(done, state('OTHER', 'complete', 'm2')), false);
  assert.equal(mod.hasNewReply(done, {...done, me: {...done.me, id: 'other'}}), false);
});
test('a late rejection from a failed track cannot stop its successfully playing replacement', async () => {
  const s = setup(); let rejectFirst, calls = 0;
  s.media.play = function () { this.paused = false; return ++calls === 1 ? new Promise((_, reject) => { rejectFirst = reject; }) : Promise.resolve(); };
  const starting = s.audio.setEnabled(true);
  s.fire('error'); await tick();
  assert.equal(s.media.src, mod.TRACKS[1].url);
  rejectFirst(Error('Failed old track')); await starting; await tick();
  assert.equal(s.audio.settings.enabled, true); assert.equal(s.media.paused, false);
});

test('explicit mute and volumes survive controller recreation', async () => {
 const s = setup(); assert.equal(s.audio.settings.enabled, true);
 await s.audio.setEnabled(false); s.audio.setVolume('music', .6);
 const reloaded = setup(JSON.stringify(s.saved()));
 assert.equal(reloaded.audio.settings.enabled, false); assert.equal(reloaded.audio.settings.music, .6);
 await reloaded.audio.start(); assert.equal(reloaded.plays.length, 0);
});
test('blocked automatic playback retries without changing enabled preference', async () => {
 const s = setup(null, {rejectPlay:true}); await s.audio.start();
 assert.equal(s.audio.settings.enabled, true); assert.equal(s.audio.settings.playing, false); assert.equal(s.audio.settings.waiting, true);
 s.media.play = function () { this.paused = false; return Promise.resolve(); };
 await s.audio.start(); assert.equal(s.audio.settings.playing, true); assert.equal(s.audio.settings.waiting, false);
});

test('an enabled page initially hidden starts when revealed and waiting can be muted', async () => {
 const s = setup(); s.audio.setHidden(true); await s.audio.start(); assert.equal(s.plays.length, 0);
 s.audio.setHidden(false); await tick(); assert.equal(s.audio.settings.playing, true);
 const blocked = setup(null, {rejectPlay: true}); await blocked.audio.start(); await blocked.audio.setEnabled(false);
 assert.equal(blocked.audio.settings.enabled, false); assert.equal(blocked.saved().enabled, false);
});
