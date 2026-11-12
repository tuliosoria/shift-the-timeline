// Self-hosted sound: on by default, with remembered mute and browser autoplay fallback.
export const TRACKS = Object.freeze([
  {url: '/assets/audio/investigation-noir.mp3', title: 'Noir Investigation'},
  {url: '/assets/audio/investigation.mp3', title: 'Steampunk Investigation'},
]);
export const EFFECTS = Object.freeze({click: '/assets/audio/click.wav', send: '/assets/audio/send.wav', receive: '/assets/audio/receive.wav'});
const KEY = 'shift-audio-v1', DEFAULTS = {music: .2, effects: .35};
const validVolume = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

export function hasNewReply(previous, next) {
  if (!previous || previous.code !== next?.code || previous.me?.id !== next.me?.id) return false;
  const before = new Map(previous.me.interviews.flatMap(i => i.messages).map(m => [m.id, m.status]));
  return next.me.interviews.some(i => i.messages.some(m => m.status !== 'pending' && (!before.has(m.id) || before.get(m.id) === 'pending')));
}

export function createAudio({createMedia, createContext, fetch, storage, onChange = () => {}}) {
  let saved; try { saved = JSON.parse(storage?.getItem(KEY)); } catch {}
  // User preference is separate from browser permission and actual playback.
  const settings = {enabled: saved?.enabled !== false, playing: false, waiting: false, music: validVolume(saved?.music) ? saved.music : DEFAULTS.music, effects: validVolume(saved?.effects) ? saved.effects : DEFAULTS.effects};
  const media = createMedia(); media.preload = 'none';
  let context, musicGain, effectsGain, hidden = false, track = 0, generation = 0, failedTracks = 0;
  const buffers = new Map(), active = new Set();
  const notify = () => onChange({...settings, track: TRACKS[track].title});
  const save = () => { try { storage?.setItem(KEY, JSON.stringify({enabled: settings.enabled, music: settings.music, effects: settings.effects})); } catch {} };
  const stop = () => { settings.playing = false; media.pause(); for (const source of active) { try { source.stop(); } catch {} } active.clear(); };
  function initialise() {
    if (context) return;
    context = createContext();
    musicGain = context.createGain(); effectsGain = context.createGain();
    musicGain.gain.value = settings.music; effectsGain.gain.value = settings.effects;
    context.createMediaElementSource(media).connect(musicGain); musicGain.connect(context.destination); effectsGain.connect(context.destination);
    // Effects are tiny and decoded once. Missing clips are silent.
    for (const [name, url] of Object.entries(EFFECTS)) {
      Promise.resolve().then(() => fetch(url)).then(response => { if (!response.ok) throw Error('Missing sound'); return response.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes)).then(buffer => buffers.set(name, buffer)).catch(() => {});
    }
  }
  function fail() { generation++; stop(); settings.waiting = settings.enabled; notify(); }
  async function play() {
    if (!settings.enabled || hidden) return false;
    const request = generation;
    settings.waiting = true; settings.playing = false; notify();
    try {
      // Invoke both while still inside the gesture for Safari's autoplay policy.
      const resume = context.resume();
      if (!media.src) media.src = TRACKS[track].url;
      const playback = media.play();
      await Promise.all([resume, playback]);
      if (request !== generation || !settings.enabled || hidden) { if (!settings.enabled || hidden) stop(); return false; }
      settings.playing = true; settings.waiting = false; notify(); return true;
    } catch { if (request === generation) fail(); return false; }
  }
  function nextTrack() {
    generation++; // A rejected play() from the previous URL must not stop this track.
    track = (track + 1) % TRACKS.length; media.src = TRACKS[track].url; notify(); void play();
  }
  media.addEventListener('pause', () => { settings.playing = false; notify(); });
  media.addEventListener('waiting', () => { settings.playing = false; notify(); });
  media.addEventListener('playing', () => { settings.playing = settings.enabled && !hidden && context?.state === 'running'; if (settings.playing) settings.waiting = false; notify(); });
  media.addEventListener('ended', () => { failedTracks = 0; if (settings.enabled) nextTrack(); });
  media.addEventListener('error', () => {
    if (!settings.enabled) return;
    // One unavailable track may be skipped; two must not create a request loop.
    if (++failedTracks >= TRACKS.length) fail(); else nextTrack();
  });
  return {
    get settings() { return {...settings}; },
    async start() {
      if (!settings.enabled || hidden) return false;
      generation++;
      try { initialise(); } catch { fail(); return false; }
      return play();
    },
    async setEnabled(enabled) {
      generation++; settings.enabled = !!enabled; settings.waiting = false; save();
      if (!settings.enabled) { stop(); notify(); return true; }
      try { initialise(); } catch { fail(); return false; }
      failedTracks = 0; notify(); return play();
    },
    setVolume(channel, value) {
      if (!(channel in DEFAULTS) || !validVolume(value)) return;
      settings[channel] = value;
      const gain = channel === 'music' ? musicGain : effectsGain;
      if (gain) gain.gain.value = value;
      save(); notify();
    },
    setHidden(value) { hidden = !!value; generation++; if (hidden) { stop(); notify(); } else if (settings.enabled) { try { initialise(); void play(); } catch { fail(); } } },
    effect(name) {
      if (!settings.enabled || hidden || !settings.effects || !buffers.has(name) || context?.state !== 'running') return;
      // Limit rapid taps; sound is feedback, not a queue of delayed events.
      if (active.size >= 4) return;
      try {
        const source = context.createBufferSource(); source.buffer = buffers.get(name); source.connect(effectsGain);
        source.onended = () => active.delete(source); active.add(source); source.start();
      } catch { /* Audio must never prevent a click or a message. */ }
    },
  };
}

export function mountAudio(doc = document, win = window) {
  const toggle = doc.getElementById('sound-toggle'), settingsButton = doc.getElementById('sound-settings');
  const dialog = doc.getElementById('sound-dialog'), music = doc.getElementById('music-volume'), effects = doc.getElementById('effects-volume');
  let storage; try { storage = win.localStorage; } catch {}
  const audio = createAudio({createMedia: () => new win.Audio(), createContext: () => new (win.AudioContext || win.webkitAudioContext)(), fetch: win.fetch.bind(win), storage,
    onChange: state => {
      const label = state.enabled ? 'Mute sound' : 'Enable sound';
      toggle.querySelector('.sound-label').textContent = label; toggle.setAttribute('aria-label', label);
      toggle.classList.toggle('is-playing', state.playing); toggle.classList.toggle('is-waiting', state.waiting);
      toggle.setAttribute('aria-pressed', String(state.enabled));
      music.value = Math.round(state.music * 100); effects.value = Math.round(state.effects * 100);
      doc.getElementById('music-level').textContent = `${music.value}%`; doc.getElementById('effects-level').textContent = `${effects.value}%`;
      doc.getElementById('sound-track').textContent = state.enabled ? (state.waiting ? 'Sound is on · tap anywhere in the game to start' : state.track) : 'Sound is off';
    }});
  toggle.querySelector('.sound-label').textContent = audio.settings.enabled ? 'Mute sound' : 'Enable sound';
  toggle.setAttribute('aria-label', audio.settings.enabled ? 'Mute sound' : 'Enable sound');
  toggle.setAttribute('aria-pressed', String(audio.settings.enabled));
  music.value = Math.round(audio.settings.music * 100); effects.value = Math.round(audio.settings.effects * 100);
  doc.getElementById('music-level').textContent = `${music.value}%`; doc.getElementById('effects-level').textContent = `${effects.value}%`;
  toggle.addEventListener('click', () => { void audio.setEnabled(!audio.settings.enabled); });
  settingsButton.addEventListener('click', () => { dialog.showModal(); });
  doc.getElementById('sound-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => settingsButton.focus({preventScroll: true}));
  music.addEventListener('input', () => audio.setVolume('music', Number(music.value) / 100));
  effects.addEventListener('input', () => audio.setVolume('effects', Number(effects.value) / 100));
  doc.addEventListener('visibilitychange', () => audio.setHidden(doc.hidden));
  audio.setHidden(doc.hidden);
  // Try normal autoplay; a blocked browser gets the same attempt on a real gesture.
  const unlock = event => {
    if (!event.isTrusted || event.target.closest?.('#audio-controls, #sound-dialog') || !audio.settings.enabled || audio.settings.playing) return;
    void audio.start();
  };
  doc.addEventListener('pointerdown', unlock, true);
  doc.addEventListener('keydown', unlock, true);
  doc.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || button.disabled || button.closest('#audio-controls, #sound-dialog') || button.classList.contains('send')) return;
    audio.effect('click');
  }, true);
  return audio;
}
