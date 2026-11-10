// Public, deterministic routing only. No case facts, answers or solution data belong here.
export const topicLabels=Object.freeze({
  alibi:'Where were you at the time?',
  clue:'What did you notice?',
  motive:'What was at stake?',
  relationship:'How did you know the victim?',
});

// Preserve the server's precedence: alibi, then motive, then relationship, else clue.
export function inferTopic(question){
  const q=question.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  if(/\b(?:onde|estava\w*|horarios?|alibi|22h?|ontem|where|when|time|yesterday)\b/.test(q))return 'alibi';
  if(/\b(?:motivo\w*|dinheiro|segredo\w*|divida\w*|ganha\w*|perde\w*|why|motive|money|secret|debt|gain|lose|profit)\b/.test(q))return 'motive';
  if(/\b(?:vitima\w*|conhec\w*|relacao|relacoes|relacion\w*|victim|know|knew|relationship|related)\b/.test(q))return 'relationship';
  return 'clue';
}

// Shortcut labels are an explicit UI override, not a change to server inference.
export function questionTopic(question){
  return Object.entries(topicLabels).find(([,label])=>label===question.trim())?.[0]??inferTopic(question);
}
