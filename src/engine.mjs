import { randomBytes, randomUUID } from 'node:crypto';
import { RULES, VISION, SUSPECTS, SOLUTION } from './case.mjs';
export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new GameError(message, status); };
const validText = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${label}: use de 1 a ${max} caracteres.`);
  return value.trim();
};
const clientKey = (value) => {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[\w-]{32,100}$/.test(value)) fail('Identificador de reconexão inválido.');
  return value;
};
export const HOST_LEASE_MS = 60_000;
const publicSuspects = SUSPECTS.map(({ id, name, role }) => ({ id, name, role }));
export class GameStore {
  constructor({ now = Date.now, ttl = 24 * 60 * 60 * 1000, maxRooms = 250 } = {}) {
    this.rooms = new Map(); this.creations = new Map(); this.now = now; this.ttl = ttl; this.maxRooms = maxRooms;
  }
  cleanup() {
    for (const [code, room] of this.rooms) if (this.now() - room.createdAt >= this.ttl) this.rooms.delete(code);
    for (const [key, code] of this.creations) if (!this.rooms.has(code)) this.creations.delete(key);
  }
  player(name, clientId) {
    return { id: randomUUID(), token: randomBytes(32).toString('hex'), name: validText(name, 32, 'Nome'), clientId, lastSeen: this.now(), done: false, interview: null, history: [], accusation: null, requests: new Set() };
  }
  create({ name, clientId } = {}) {
    this.cleanup(); const key = clientKey(clientId);
    if (key && this.creations.has(key)) {
      const room = this.rooms.get(this.creations.get(key));
      const p = room.players.find(p => p.clientId === key);
      if (p) return { code: room.code, token: p.token };
    }
    if (this.rooms.size >= this.maxRooms) fail('Limite de salas atingido. Tente mais tarde.', 503);
    const p = this.player(name, key);
    let code; do { code = randomBytes(4).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    this.rooms.set(code, { code, createdAt: this.now(), hostId: p.id, players: [p], phase: 'lobby', round: 0, notes: [], result: null });
    if (key) this.creations.set(key, code);
    return { code, token: p.token };
  }
  room(code) {
    this.cleanup(); const room = this.rooms.get(String(code).toUpperCase());
    if (!room) fail('Sala não encontrada ou expirada. Crie uma nova sala.', 404);
    return room;
  }
  join(code, { name, clientId } = {}) {
    const room = this.room(code); const key = clientKey(clientId);
    const prior = key && room.players.find(p => p.clientId === key);
    if (prior) return { code: room.code, token: prior.token };
    if (room.phase !== 'lobby') fail('A partida já começou.', 409);
    if (room.players.length >= RULES.maxPlayers) fail('Sala cheia (máximo de quatro jogadores).', 409);
    const p = this.player(name, key);
    if (room.players.some(other => other.name.toLocaleLowerCase('pt-BR') === p.name.toLocaleLowerCase('pt-BR'))) fail('Escolha um nome diferente dos demais jogadores.', 409);
    room.players.push(p); return { code: room.code, token: p.token };
  }
  authenticate(room, token) {
    const p = typeof token === 'string' && room.players.find(p => p.token === token);
    if (!p) fail('Sessão inválida. Entre novamente na sala.', 401);
    p.lastSeen = this.now();
    return p;
  }
  hostRecoverable(room) {
    const host = room.players.find(player => player.id === room.hostId);
    return room.phase !== 'finished' && !!host && this.now() - host.lastSeen >= HOST_LEASE_MS;
  }
  get(code, token) { const room = this.room(code); return this.snapshot(room, this.authenticate(room, token)); }
  snapshot(room, self) {
    return structuredClone({ code: room.code, phase: room.phase, round: room.round, maxRounds: RULES.rounds,
      hoursRemaining: room.phase === 'lobby' ? 24 : room.phase === 'investigation' ? 24 - (room.round - 1) * 8 : 0,
      hostId: room.hostId, selfId: self.id, hostRecoverable: this.hostRecoverable(room),
      players: room.players.map(p => ({ id: p.id, name: p.name, done: p.done, hasAccused: p.accusation !== null })),
      suspects: publicSuspects, vision: VISION, interview: self.interview,
      history: self.history, notes: room.notes, hasAccused: self.accusation !== null,
      ...(room.result ? { result: room.result } : {}),
    });
  }
  advance(room) {
    if (room.phase === 'investigation' && room.players.every(p => p.done)) {
      for (const p of room.players) {
        if (p.interview) p.history.push({ round: room.round, ...p.interview });
        p.interview = null; p.done = false;
      }
      if (room.round === RULES.rounds) room.phase = 'accusation'; else room.round++;
    }
    if (room.phase === 'accusation' && room.players.every(p => p.accusation !== null)) {
      const correct = room.players.filter(p => p.accusation === SOLUTION.culpritId).length;
      room.phase = 'finished';
      room.result = { outcome: correct === room.players.length ? 'complete' : correct ? 'partial' : 'defeat',
        correct, total: room.players.length, culpritId: SOLUTION.culpritId, culprit: { name: SOLUTION.culprit },
        title: correct === room.players.length ? 'Futuro alterado' : correct ? 'Vitória com consequências' : 'A visão se cumpriu',
        summary: correct === room.players.length ? 'O crime foi impedido, sem inocentes presos.' : correct ? 'O crime foi impedido, mas acusações erradas levaram inocentes à prisão.' : 'Ninguém identificou a responsável. O crime aconteceu.',
        explanation: SOLUTION.explanation, evidence: SOLUTION.clues,
        accusations: room.players.map(p => ({ name: p.name, suspectId: p.accusation, suspectName: SUSPECTS.find(s => s.id === p.accusation).name, correct: p.accusation === SOLUTION.culpritId })),
      };
    }
  }
  act(code, token, action = {}) {
    const room = this.room(code); const p = this.authenticate(room, token);
    if (!action || typeof action !== 'object' || Array.isArray(action)) fail('Ação inválida.');
    const { type, requestId } = action;
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[\w-]{1,100}$/.test(requestId))) fail('Identificador de ação inválido.');
    if (requestId && p.requests.has(requestId)) return this.snapshot(room, p);
    if (action.round !== undefined && action.round !== room.round) fail('O turno mudou. Atualize a sala antes de agir.', 409);
    const requirePhase = (phase) => { if (room.phase !== phase) fail('Esta ação não está disponível nesta fase.', 409); };
    const requireHost = () => { if (p.id !== room.hostId) fail('Somente o anfitrião pode fazer isso.', 403); };
    switch (type) {
      case 'start':
        requirePhase('lobby'); requireHost();
        if (room.players.length < RULES.minPlayers) fail('São necessários pelo menos três jogadores.', 409);
        room.phase = 'investigation'; room.round = 1; break;
      case 'select': {
        requirePhase('investigation');
        if (p.done || p.interview) fail('Você já escolheu uma entrevista neste turno.', 409);
        const suspect = SUSPECTS.find(s => s.id === action.suspectId);
        if (!suspect) fail('Suspeito inválido.');
        p.interview = { suspectId: suspect.id, remaining: RULES.questions, messages: [{ role: 'suspect', text: `Sou ${suspect.name}, ${suspect.role.toLowerCase()}. Pergunte e vou compartilhar o que sei. Neste protótipo, cada pergunta avança um depoimento escrito, sem IA ao vivo.` }] };
        break;
      }
      case 'ask': {
        requirePhase('investigation');
        if (p.done || !p.interview || !p.interview.remaining) fail('Não há perguntas disponíveis nesta entrevista.', 409);
        const text = validText(action.text, 500, 'Pergunta');
        const suspect = SUSPECTS.find(s => s.id === p.interview.suspectId);
        const fact = suspect.facts[RULES.questions - p.interview.remaining];
        p.interview.messages.push({ role: 'user', text }, { role: 'suspect', text: fact }); p.interview.remaining--; break;
      }
      case 'finish':
        requirePhase('investigation');
        if (p.done || !p.interview) fail('Escolha uma entrevista antes de encerrar o turno.', 409);
        p.done = true; this.advance(room); break;
      case 'share':
        if (!['investigation', 'accusation'].includes(room.phase)) fail('Compartilhe pistas durante a investigação ou acusação.', 409);
        if (room.notes.length >= 100) fail('O quadro atingiu o limite de 100 notas.', 409);
        room.notes.push({ id: randomUUID(), name: p.name, text: validText(action.text, 1000, 'Nota'), round: room.round }); break;
      case 'accuse':
        requirePhase('accusation');
        if (p.accusation !== null) fail('A acusação já foi enviada e não pode ser alterada.', 409);
        if (!SUSPECTS.some(s => s.id === action.suspectId)) fail('Suspeito inválido.');
        p.accusation = action.suspectId; this.advance(room); break;
      case 'claimHost':
        if (p.id === room.hostId || !this.hostRecoverable(room)) fail('O anfitrião está ativo ou a partida terminou. Aguarde 60 segundos sem conexão.', 409);
        room.hostId = p.id; break;
      case 'remove':
        requireHost();
        if (room.phase === 'finished') fail('A partida já terminou.', 409);
        if (action.playerId === p.id) fail('Use sair para deixar a sala.');
        if (!room.players.some(other => other.id === action.playerId)) fail('Jogador não encontrado.', 404);
        room.players = room.players.filter(other => other.id !== action.playerId); this.advance(room); break;
      case 'leave':
        room.players = room.players.filter(other => other.id !== p.id);
        if (!room.players.length) this.rooms.delete(room.code);
        else { if (room.hostId === p.id) room.hostId = room.players[0].id; this.advance(room); }
        return { left: true };
      default: fail('Ação desconhecida.');
    }
    if (requestId) {
      p.requests.add(requestId);
      // A room is bounded to 3 rounds; keep enough retry keys for the entire game.
      if (p.requests.size > 500) p.requests.delete(p.requests.values().next().value);
    }
    return this.snapshot(room, p);
  }
}
