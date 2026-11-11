// Deductions: individual facts a player unlocks by questioning suspects. Never shared between players.
const MAX_AI_UNLOCKS = 3;

export function sourcesFor(caseData, suspectId) {
  const ids = new Set();
  for (const d of caseData.deductions ?? []) if (d.sources.some(s => s.suspectId === suspectId)) ids.add(d.id);
  return ids;
}

function record(player, interview, message, ids) {
  player.deductions ??= [];
  for (const id of ids) player.deductions.push({ id, round: interview.round, suspectId: interview.suspectId, messageId: message.id });
  message.unlocked = [...ids];
  return ids;
}

const unlockedIds = player => new Set((player.deductions ?? []).map(d => d.id));

export function resolveCanonical(caseData, player, interview, message) {
  message.status = 'canonical';
  message.reply = message.answer;
  const have = unlockedIds(player);
  const ids = (caseData.deductions ?? [])
    .filter(d => !have.has(d.id) && d.sources.some(s => s.suspectId === interview.suspectId && s.topic === message.topic))
    .map(d => d.id);
  return record(player, interview, message, ids);
}

export function resolveWithAi(caseData, player, interview, message, { reply, unlocked } = {}) {
  message.status = 'complete';
  message.reply = reply;
  const allowed = sourcesFor(caseData, interview.suspectId), have = unlockedIds(player), ids = [];
  for (const id of Array.isArray(unlocked) ? unlocked : []) {
    if (ids.length >= MAX_AI_UNLOCKS) break;
    if (typeof id === 'string' && allowed.has(id) && !have.has(id) && !ids.includes(id)) ids.push(id);
  }
  return record(player, interview, message, ids);
}

export function deductionView(caseData, player) {
  const byId = new Map((caseData.deductions ?? []).map(d => [d.id, d]));
  return (player.deductions ?? []).filter(u => byId.has(u.id)).map(u => ({ id: u.id, text: byId.get(u.id).text, suspectId: u.suspectId, round: u.round,
    ...(typeof u.messageId === 'string' ? {messageId: u.messageId} : {}) }));
}

// Smallest number of distinct suspects whose sources (any topic) cover every key deduction; Infinity if none up to 9.
export function minimumSuspectCover(caseData) {
  const keys = (caseData.deductions ?? []).filter(d => d.key);
  const suspects = caseData.suspects.map(s => new Set(keys.filter(d => d.sources.some(x => x.suspectId === s.id)).map(d => d.id)));
  const need = keys.length, limit = Math.min(9, suspects.length);
  if (!need) return 0;
  const search = (start, left, covered) => {
    if (covered.size === need) return true;
    if (!left) return false;
    for (let i = start; i < suspects.length; i++) if (search(i + 1, left - 1, new Set([...covered, ...suspects[i]]))) return true;
    return false;
  };
  for (let size = 1; size <= limit; size++) if (search(0, size, new Set())) return size;
  return Infinity;
}
