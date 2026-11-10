const KEY = 'shift-ui-v1';
export const STAGES = Object.freeze(['analyse', 'interrogate', 'deduce']);
const emptyCorrelation = () => ({sources: [], relation: 'related', text: ''});
const copy = value => JSON.parse(JSON.stringify(value));
const identity = c => typeof c?.room === 'string' && typeof c?.player === 'string' && Number.isInteger(c?.round) && typeof c?.phase === 'string';
const contextKey = (c, field) => JSON.stringify([c.room, c.player, c.round, c.phase, field === 'question' ? c.suspect ?? null : null, field]);
function cleanValue(field, value) {
  if (field === 'stage') return STAGES.includes(value) ? value : 'analyse';
  if (field === 'question' || field === 'note') return typeof value === 'string' ? value.slice(0, 10000) : '';
  if (field === 'correlation') return value && typeof value === 'object' && !Array.isArray(value) ? {
    sources: Array.isArray(value.sources) ? value.sources.slice(0, 2).map(s => s && ['case', 'suspect', 'clue'].includes(s.kind) && typeof s.id === 'string' ? {kind: s.kind, id: s.id} : null) : [],
    relation: ['related', 'supports', 'contradicts'].includes(value.relation) ? value.relation : 'related',
    text: typeof value.text === 'string' ? value.text.slice(0, 10000) : '',
  } : emptyCorrelation();
  return null;
}
export function uiContext(state) {
  if (!state?.me) return null;
  return {room: state.code, player: state.me.id, round: state.round, phase: state.phase,
    suspect: state.me.interviews?.find(i => i.round === state.round)?.suspectId ?? null};
}
export function createUiState(storage) {
  let persistent = true;
  const records = new Map();
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (saved?.version === 1 && Array.isArray(saved.records)) for (const record of saved.records) {
      if (!identity(record.context) || !['stage', 'question', 'note', 'correlation'].includes(record.field)) continue;
      records.set(contextKey(record.context, record.field), {context: copy(record.context), field: record.field, value: cleanValue(record.field, record.value)});
    }
  } catch { persistent = false; }
  function persist() {
    try { storage.setItem(KEY, JSON.stringify({version: 1, records: [...records.values()]})); }
    catch { persistent = false; }
  }
  function get(c, field) { return copy(records.get(contextKey(c, field))?.value ?? (field === 'stage' ? 'analyse' : field === 'correlation' ? emptyCorrelation() : '')); }
  function put(c, field, value) {
    if (!identity(c)) return;
    records.set(contextKey(c, field), {context: {...c, suspect: field === 'question' ? c.suspect ?? null : null}, field, value: cleanValue(field, value)});
    persist();
  }
  return {
    get persistent() { return persistent; },
    read(c) { return identity(c) ? {stage: get(c, 'stage'), question: get(c, 'question'), note: get(c, 'note'), correlation: get(c, 'correlation')} : {stage: 'analyse', question: '', note: '', correlation: emptyCorrelation()}; },
    writeDraft(c, field, value) { if (['question', 'note', 'correlation'].includes(field)) put(c, field, value); },
    setStage(c, stage) { if (STAGES.includes(stage)) put(c, 'stage', stage); },
    clearMatchingDraft(c, field, value) {
      if (identity(c) && JSON.stringify(get(c, field)) === JSON.stringify(cleanValue(field, value))) { records.delete(contextKey(c, field)); persist(); }
    },
    recoverable(c) {
      if (!identity(c)) return [];
      return [...records.values()].filter(r => r.context.room === c.room && r.context.player === c.player && (r.context.round !== c.round || r.context.phase !== c.phase) && r.field !== 'stage' && (r.field === 'correlation' ? r.value.text : r.value)).map(r => ({round: r.context.round, phase: r.context.phase, suspect: r.context.suspect, field: r.field, value: copy(r.value)}));
    },
    forget(room, player) { for (const [key, r] of records) if (r.context.room === room && r.context.player === player) records.delete(key); persist(); },
  };
}
