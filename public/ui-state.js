// Client-only memory: unsent question drafts per interview and the "seen" flags
// (briefing, last turn transition) per room and player. Nothing here is sent to the server.
const KEY = 'shift-ui-v2';
const MAX_DRAFT = 10000;
const unseen = () => ({briefingSeen: false, lastSeenRound: 0});
const draftKey = c => JSON.stringify([c.room, c.player, c.round, c.suspect ?? null]);
const seenKey = (room, player) => JSON.stringify([room, player]);
const validDraftContext = c => typeof c?.room === 'string' && typeof c?.player === 'string' && Number.isInteger(c?.round);
const cleanSeen = s => ({briefingSeen: s?.briefingSeen === true, lastSeenRound: Number.isInteger(s?.lastSeenRound) && s.lastSeenRound >= 0 ? s.lastSeenRound : 0});

export function uiContext(state) {
  if (!state?.me) return null;
  return {room: state.code, player: state.me.id, round: state.round, phase: state.phase,
    suspect: state.me.interviews?.find(i => i.round === state.round)?.suspectId ?? null};
}

export function createUiState(storage) {
  let persistent = true;
  const drafts = new Map(), seen = new Map(), notebooks = new Map();
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (saved?.version === 2) {
      for (const d of Array.isArray(saved.drafts) ? saved.drafts : []) {
        if (validDraftContext(d?.context) && typeof d.value === 'string') {
          const context = {room: d.context.room, player: d.context.player, round: d.context.round, suspect: typeof d.context.suspect === 'string' ? d.context.suspect : null};
          drafts.set(draftKey(context), {context, value: d.value.slice(0, MAX_DRAFT)});
        }
      }
      for (const s of Array.isArray(saved.seen) ? saved.seen : []) {
        if (typeof s?.room === 'string' && typeof s?.player === 'string') seen.set(seenKey(s.room, s.player), {room: s.room, player: s.player, ...cleanSeen(s)});
      }
      for (const n of Array.isArray(saved.notebooks) ? saved.notebooks : []) {
        if (typeof n?.room === 'string' && typeof n?.player === 'string') notebooks.set(seenKey(n.room, n.player), {room: n.room, player: n.player, ...cleanNotebook(n)});
      }
    }
  } catch { persistent = false; }
  function persist() {
    try { storage.setItem(KEY, JSON.stringify({version: 2, drafts: [...drafts.values()], seen: [...seen.values()], notebooks: [...notebooks.values()]})); }
    catch { persistent = false; }
  }
  return {
    get persistent() { return persistent; },
    notebook(room, player) { return cleanNotebook(notebooks.get(seenKey(room, player))); },
    saveNotebook(room, player, value) {
      if (typeof room !== 'string' || typeof player !== 'string') return;
      notebooks.set(seenKey(room, player), {room, player, ...cleanNotebook(value)});
      persist();
    },
    draft(c) { return validDraftContext(c) ? drafts.get(draftKey(c))?.value ?? '' : ''; },
    writeDraft(c, value) {
      if (!validDraftContext(c)) return;
      const text = typeof value === 'string' ? value.slice(0, MAX_DRAFT) : '';
      if (text) drafts.set(draftKey(c), {context: {room: c.room, player: c.player, round: c.round, suspect: c.suspect ?? null}, value: text});
      else drafts.delete(draftKey(c));
      persist();
    },
    // Clears the draft only if it still holds what was sent, so a late acknowledgement never erases newer typing.
    clearMatchingDraft(c, sent) { if (validDraftContext(c) && drafts.get(draftKey(c))?.value === sent) { drafts.delete(draftKey(c)); persist(); } },
    seen(room, player) { const s = seen.get(seenKey(room, player)); return s ? cleanSeen(s) : unseen(); },
    markSeen(room, player, {briefingSeen, lastSeenRound} = {}) {
      if (typeof room !== 'string' || typeof player !== 'string') return;
      const current = this.seen(room, player);
      seen.set(seenKey(room, player), {room, player,
        briefingSeen: current.briefingSeen || briefingSeen === true,
        lastSeenRound: Number.isInteger(lastSeenRound) ? Math.max(current.lastSeenRound, lastSeenRound) : current.lastSeenRound});
      persist();
    },
    forget(room, player) {
      for (const [key, d] of drafts) if (d.context.room === room && d.context.player === player) drafts.delete(key);
      seen.delete(seenKey(room, player));
      notebooks.delete(seenKey(room, player));
      persist();
    },
  };
}

function cleanNotebook(value) {
  const text = key => typeof value?.[key] === 'string' ? value[key].slice(0, 200) : null;
  return {open: value?.open === true, section: value?.section === 'interviews' ? 'interviews' : 'deductions',
    interview: text('interview'), message: text('message'), deduction: text('deduction'), suspect: text('suspect'), returnTab: value?.returnTab === 'deductions' ? 'deductions' : 'investigate',
    returnSelected: text('returnSelected'), returnRound: Number.isInteger(value?.returnRound) ? value.returnRound : null, returnPhase: text('returnPhase')};
}
