// Public, deterministic routing only. No case facts, answers or solution data belong here.
export const topicLabels=Object.freeze({
  alibi:'Where were you during the preparations?',
  clue:'Have you noticed anything unusual?',
  motive:'Have you had any disagreements recently?',
  relationship:'Do you know the person at risk?',
});

export const portugueseTopicLabels = Object.freeze({alibi:'Onde você estava durante os preparativos?', clue:'O que você percebeu de incomum?', motive:'Você teve desentendimentos recentemente?', relationship:'Você conhece a pessoa em risco?'});
export const getTopicLabels = locale => locale === 'pt-BR' ? portugueseTopicLabels : topicLabels;

// Preserve the server's precedence: alibi, then motive, then relationship, else clue.
export function inferTopic(question){
  const q=question.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  if(/\b(?:onde|estava\w*|horarios?|alibi|22h?|ontem|where|when|time|yesterday)\b/.test(q))return 'alibi';
  if(/\b(?:motivo\w*|desentendimentos?|dinheiro|segredo\w*|divida\w*|ganha\w*|perde\w*|disagreements?|why|motive|money|secret|debt|gain|lose|profit|stakes?)\b/.test(q))return 'motive';
  if(/\b(?:vitima\w*|conhec\w*|relacao|relacoes|relacion\w*|victim|know|knew|relationship|related)\b/.test(q))return 'relationship';
  return 'clue';
}

// Shortcut labels are an explicit UI override, not a change to server inference.
export function questionTopic(question){
  return [...Object.entries(topicLabels), ...Object.entries(portugueseTopicLabels)].find(([,label])=>label===question.trim())?.[0]??inferTopic(question);
}
