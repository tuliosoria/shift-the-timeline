// One persistent background film behind every screen. Silent, looping, never a control.
export const FILMS = Object.freeze({
  landing: 'train', lobby: 'train', briefing: 'train',
  pick: 'corridor', chat: 'corridor',
  waiting: 'pocket-watch', transition: 'pocket-watch', accuse: 'pocket-watch', reveal: 'pocket-watch',
});

export function createBackdrop({document: doc, matchMedia}) {
  const video = doc.getElementById('backdrop');
  let film = null;
  const reducedMotion = () => !!matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const play = () => { if (video.src && !doc.hidden && !reducedMotion()) video.play()?.catch?.(() => {}); };
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) video.pause(); else play(); });
  return {
    get film() { return film; },
    setScene(name) {
      const next = FILMS[name] ?? 'train';
      if (!video || next === film) return;
      film = next;
      video.poster = `/assets/films/${next}.webp`;
      if (reducedMotion()) { video.removeAttribute('src'); video.load?.(); return; }
      video.src = `/assets/films/${next}.mp4`;
      play();
    },
  };
}

let shared;
export function setScene(name) {
  shared ??= createBackdrop({document: globalThis.document, matchMedia: globalThis.matchMedia?.bind(globalThis)});
  shared.setScene(name);
}
