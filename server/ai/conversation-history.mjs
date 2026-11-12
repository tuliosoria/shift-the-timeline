import {CONFIG} from '../game.mjs';

// A player can have at most this many earlier answers before the final question.
// The byte budget can retain fewer; an exchange is always kept whole or omitted.
export const MAX_HISTORY_EXCHANGES = CONFIG.rounds * CONFIG.maxQuestions - 1;
const SETTLED = new Set(['canonical', 'complete']);

export function collectConversationHistory({room, player, interview, message}) {
  // Admission passes objects from one authoritative room clone. Do not accept a
  // foreign player/interview merely because an identifier happens to match.
  if (!room.players?.includes(player) || !player.interviews?.includes(interview) || !interview.messages?.includes(message)) {
    throw new Error('History must belong to the admitted room and player');
  }
  const history = [];
  const visits = player.interviews.filter(i => i.suspectId === interview.suspectId
    && Number.isInteger(i.round) && i.round > 0 && i.round <= interview.round)
    .slice().sort((a, b) => a.round - b.round);
  for (const visit of visits) {
    for (const previous of visit.messages ?? []) {
      if (previous === message) break;
      if (!SETTLED.has(previous.status) || typeof previous.question !== 'string' || !previous.question.trim()
        || typeof previous.reply !== 'string' || !previous.reply.trim()) continue;
      // Only primitive copied fields leave the room: no IDs, unlock flags,
      // private case material, another player's chat or references to live state.
      history.push({round: visit.round, question: previous.question, reply: previous.reply});
    }
  }
  return history;
}

// `build` must validate the complete provider/storage envelope and return its
// immutable payload. Start with recent context, then retain the first exchange
// as an anchor when possible, filling remaining capacity newest-first. Sorting
// only the chosen indices keeps the final transcript chronological.
export function fitConversationHistory(history, build) {
  let result = build([]);
  const chosen = new Set();
  const latest = history.length - 1;
  const priority = [...new Set([latest, latest - 1, 0, ...history.map((_, i) => i).reverse()])]
    .filter(i => i >= 0 && i < history.length);
  for (const index of priority) {
    if (chosen.size >= MAX_HISTORY_EXCHANGES) break;
    const indices = [...chosen, index].sort((a, b) => a - b);
    let candidate;
    try { candidate = build(indices.map(i => ({...history[i]}))); }
    catch { continue; } // Only this whole exchange is too large; try smaller ones.
    chosen.add(index);
    result = candidate;
  }
  return result;
}
