// One persistent background film behind every screen. Silent, looping, never a control.
export const FILMS = Object.freeze({
  landing: 'train', lobby: 'train', briefing: 'train',
  pick: 'corridor', chat: 'corridor',
  waiting: 'pocket-watch', transition: 'pocket-watch', accuse: 'pocket-watch', reveal: 'pocket-watch',
});

export function createBackdrop({document: doc, matchMedia}) {
  const video = doc.getElementById('backdrop');
  let film = null;
  const motionQuery = matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => !!motionQuery?.matches;
  const play = () => { if (video.src && !doc.hidden && !reducedMotion()) video.play()?.catch?.(() => {}); };
  // Film for the current scene, or the poster alone under reduced motion.
  function show() {
    video.poster = `/assets/films/${film}.webp`;
    if (reducedMotion()) { video.pause(); video.removeAttribute('src'); video.load?.(); return; }
    video.src = `/assets/films/${film}.mp4`;
    play();
  }
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) video.pause(); else play(); });
  motionQuery?.addEventListener?.('change', () => { if (video && film) show(); });
  return {
    get film() { return film; },
    setScene(name) {
      const next = FILMS[name] ?? 'train';
      if (!video || next === film) return;
      film = next;
      show();
    },
  };
}

let shared;
export function setScene(name) {
  shared ??= createBackdrop({document: globalThis.document, matchMedia: globalThis.matchMedia?.bind(globalThis)});
  shared.setScene(name);
}
