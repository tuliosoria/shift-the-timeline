'use strict';
const $ = (id) => document.getElementById(id);
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const show = (id, visible) => { $(id).hidden = !visible; };
// Per-tab identity allows a local test with separate tabs and keeps reload reconnects private.
const storage = { get(key) { try { return sessionStorage.getItem(key); } catch { return null; } }, set(key, value) { try { sessionStorage.setItem(key, value); } catch {} }, remove(key) { try { sessionStorage.removeItem(key); } catch {} } };
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), b => b.toString(16).padStart(2, '0')).join('');
let clientId = storage.get('shift-client') || randomId();
storage.set('shift-client', clientId);
let session = null;
try { session = JSON.parse(storage.get('shift-session')); } catch { storage.remove('shift-session'); }
if (!session?.code || !session?.token) session = null;
let pendingAction = null;
try { pendingAction = JSON.parse(storage.get('shift-pending')); } catch {}
if (pendingAction?.code !== session?.code) pendingAction = null;
let state = null, busy = false, polling = false, generation = 0, lastPhase = '', review = false;
let rosterKey = '', notesKey = '', messagesKey = '', suspectsKey = '', resultKey = '', historyKey = '';
let noticeTimer;
function notify(text) { $('notice').textContent = text; show('notice', true); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => show('notice', false), 4500); }
function error(text) { $('error').textContent = text; show('error', true); }
function clearError() { show('error', false); }
async function api(path, body, authenticated = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', signal: controller.signal, headers: { ...(body ? { 'Content-Type':'application/json' } : {}), ...(authenticated && session ? { Authorization: `Bearer ${session.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) { const err = new Error(data.error || 'Não foi possível concluir.'); err.status = response.status; throw err; }
    return data;
  } catch (err) { if (err.name === 'AbortError') throw new Error('A conexão demorou. Atualize a sala antes de tentar novamente.'); throw err; }
  finally { clearTimeout(timeout); }
}
async function action(type, values = {}, retryPending = false) {
  if (busy || !session) return false;
  if (pendingAction && !retryPending) { error('Uma ação está sem confirmação. Use “Confirmar ação pendente” antes de continuar.'); return false; }
  busy = true; generation++; clearError();
  const current = session;
  const payload = retryPending ? pendingAction.payload : { type, ...values, round: state?.round, requestId: randomId() };
  pendingAction = {code:session.code, payload}; storage.set('shift-pending', JSON.stringify(pendingAction));
  try {
    let next;
    try { next = await api(`/api/rooms/${session.code}/actions`, payload); }
    catch (err) { if (err.status) throw err; next = await api(`/api/rooms/${session.code}/actions`, payload); }
    if (current !== session) return false;
    pendingAction = null; storage.remove('shift-pending'); show('retry-pending',false);
    if (payload.type === 'leave') { reset(); return true; }
    state = next; render(); return true;
  } catch (err) {
    if (err.status) { pendingAction = null; storage.remove('shift-pending'); }
    show('retry-pending',!!pendingAction);
    error(pendingAction ? 'Conexão interrompida. Confirme a ação pendente para continuar sem duplicar sua decisão.' : err.message); return false;
  } finally { busy = false; }
}
$('retry-pending').addEventListener('click', async () => { if (pendingAction) await action(pendingAction.payload.type, {}, true); });

function reset() {
  generation++; session = null; state = null; pendingAction = null; storage.remove('shift-pending'); show('retry-pending',false); storage.remove('shift-session'); lastPhase = ''; rosterKey = notesKey = messagesKey = suspectsKey = resultKey = historyKey = ''; review = false;
  show('game', false); show('welcome', true); show('connection', false); $('name').focus();
}
async function refresh() {
  if (!session || busy || polling) return;
  polling = true; const mine = generation; const current = session;
  try {
    const next = await api(`/api/rooms/${session.code}`);
    if (mine !== generation || current !== session || busy) return;
    state = next; show('connection', false); render();
  } catch (err) {
    if (mine !== generation || current !== session) return;
    if ([401,403,404,410].includes(err.status)) { reset(); error('Esta sessão não está mais disponível. Crie ou entre em outra sala.'); }
    else show('connection', true);
  } finally { polling = false; }
}
$('entry-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (busy) return;
  const mode = event.submitter?.value || 'create'; const name = $('name').value.trim(); const code = $('code').value.trim().toUpperCase();
  if (!name) { $('name').focus(); return; }
  if (mode === 'join' && !/^[A-Z0-9]{4,8}$/.test(code)) { error('Digite o código da sala.'); $('code').focus(); return; }
  busy = true; clearError(); generation++;
  try {
    session = await api(mode === 'create' ? '/api/rooms' : `/api/rooms/${code}/join`, { name, clientId }, false);
    storage.set('shift-session', JSON.stringify({code:session.code,token:session.token}));
    show('welcome', false); show('game', true);
  } catch (err) { error(err.message); }
  finally { busy = false; }
  await refresh();
});
$('start').addEventListener('click', () => action('start'));
$('recover-host').addEventListener('click', async () => { if (await confirmChoice('Assumir como anfitrião?', 'O anfitrião está sem conexão há pelo menos um minuto. Você poderá remover quem abandonou a partida.')) await action('claimHost'); });
$('leave').addEventListener('click', async () => {
  if (await confirmChoice('Sair da sala?', 'Sua vaga será removida. As outras pessoas poderão continuar, e você não poderá retornar depois que a investigação começar.')) await action('leave');
});
$('copy-code').addEventListener('click', async () => { try { await navigator.clipboard.writeText(session.code); notify('Código copiado. Envie para seus amigos.'); } catch { notify(`Código da sala: ${session.code}`); } });
$('search').addEventListener('input', renderSuspects);
$('ask-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const text = $('question').value.trim(); if (!text) return;
  if (await action('ask', { text })) { $('question').value = ''; $('question').focus(); }
});
for (const button of document.querySelectorAll('[data-question]')) button.addEventListener('click', () => { $('question').value = button.dataset.question; $('question').focus(); });
$('finish').addEventListener('click', async () => { if (await action('finish')) { review = false; render(); } });
$('review-interview').addEventListener('click', () => { review = true; render(); });
$('note-form').addEventListener('submit', async (event) => { event.preventDefault(); const text = $('note').value.trim(); if (!text) return; if (await action('share', { text })) { $('note').value = ''; notify('Pista compartilhada com a equipe.'); } });
function confirmChoice(title, text) {
  const dialog = $('confirm-dialog'); if (dialog.open) return Promise.resolve(false);
  $('confirm-title').textContent = title; $('confirm-copy').textContent = text;
  return new Promise((resolve) => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once:true }); dialog.returnValue = 'cancel'; dialog.showModal(); });
}
function renderPlayers() {
  const key = JSON.stringify([state.players, state.phase, state.hostId, state.selfId]); if (key === rosterKey) return; rosterKey = key;
  const cards = document.createDocumentFragment(); const rows = document.createDocumentFragment();
  for (const player of state.players) {
    const name = player.name + (player.id === state.selfId ? ' (você)' : '');
    const card = el('div', undefined, 'player-card'); card.append(el('span', player.name.slice(0,1).toUpperCase(), 'avatar'), el('b', name));
    card.append(el('small', player.id === state.hostId ? 'Anfitrião' : 'Investigador', 'muted'));
    if (state.selfId === state.hostId && player.id !== state.selfId) {
      const remove = el('button', 'Remover', 'quiet'); remove.setAttribute('aria-label', `Remover ${player.name}`);
      remove.onclick = async () => { if (await confirmChoice(`Remover ${player.name}?`, 'Use apenas se a pessoa saiu da partida. Esta ação libera a espera da equipe.')) await action('remove', {playerId:player.id}); };
      card.append(remove);
    }
    cards.append(card);
    const row = el('div'); row.append(el('span', player.name.slice(0,1).toUpperCase(),'avatar'), el('span', name));
    row.append(el('span', state.phase === 'accusation' ? (player.hasAccused ? 'Decidiu' : 'Decidindo') : player.done ? 'Concluiu' : 'Investigando', 'status')); rows.append(row);
  }
  $('lobby-players').replaceChildren(cards); $('players').replaceChildren(rows);
  // Host recovery remains available during play, not only in the lobby.
  if (state.selfId === state.hostId && state.phase !== 'lobby' && state.phase !== 'finished') {
    const manage = el('details'); const summary = el('summary', 'Gerenciar equipe'); manage.append(summary);
    for (const player of state.players.filter(p => p.id !== state.selfId)) {
      const remove = el('button', `Remover ${player.name}`, 'quiet'); remove.onclick = async () => { if (await confirmChoice(`Remover ${player.name}?`, 'Remova apenas quem abandonou a partida. A rodada poderá avançar e a pessoa não poderá retornar.')) await action('remove', {playerId:player.id}); }; manage.append(remove);
    }
    $('players').append(manage);
  }
}
function renderSuspects() {
  if (!state) return;
  const query = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const matches = state.suspects.filter(s => `${s.name} ${s.role}`.toLocaleLowerCase('pt-BR').includes(query));
  const fragment = document.createDocumentFragment();
  for (const [index,suspect] of matches.entries()) {
    const card = el('button', undefined, 'suspect'); card.dataset.suspect = suspect.id;
    const portrait = el('span',undefined,'portrait'); portrait.setAttribute('aria-hidden','true'); portrait.append(el('span',String(index + 1).padStart(2,'0')));
    const copy = el('span',undefined,'suspect-copy'); copy.append(el('strong',suspect.name),el('small',suspect.role)); card.append(portrait,copy);
    card.setAttribute('aria-label', `${state.phase === 'accusation' ? 'Acusar' : 'Entrevistar'} ${suspect.name}`);
    card.onclick = async () => {
      if (state.phase === 'accusation') { if (await confirmChoice(`Acusar ${suspect.name}?`, 'Sua decisão é privada e definitiva. A verdade será revelada quando todos decidirem.')) await action('accuse',{suspectId:suspect.id}); }
      else await action('select',{suspectId:suspect.id});
    };
    fragment.append(card);
  }
  if (!matches.length) fragment.append(el('p','Nenhum suspeito encontrado.','muted'));
  $('suspects').replaceChildren(fragment);
}
function renderInterview() {
  const interview = state.interview; if (!interview) return;
  const person = state.suspects.find(s=>s.id===interview.suspectId);
  const key = JSON.stringify(interview); if (key === messagesKey) return; messagesKey = key;
  const info = el('div'); info.append(el('h3',person?.name || 'Suspeito'),el('p',`${person?.role || ''} · Conversa privada · Respostas roteirizadas`));
  $('interview-person').replaceChildren(el('span',person?.name?.slice(0,1) || '?','avatar'),info);
  const messages = document.createDocumentFragment();
  for (const message of interview.messages) {
    const bubble = el('div',undefined,`message ${message.role==='user'?'user':'suspect'}`);
    bubble.append(el('small',message.role==='user'?'VOCÊ':person?.name || 'SUSPEITO'),el('span',message.text)); messages.append(bubble);
  }
  $('messages').replaceChildren(messages); $('messages').scrollTop = $('messages').scrollHeight;
}
function renderNotes() {
  const key = JSON.stringify(state.notes); if (key === notesKey) return; notesKey = key;
  const fragment = document.createDocumentFragment();
  for (const note of state.notes) { const card = el('article',undefined,'note'); card.append(el('b',note.name),el('p',note.text)); fragment.append(card); }
  if (!state.notes.length) fragment.append(el('p','O quadro ainda está vazio. Compartilhe descobertas, não apenas palpites.','muted'));
  $('notes').replaceChildren(fragment);
}
function renderResult() {
  const result = state.result; if (!result) return; const key = JSON.stringify(result); if (key === resultKey) return; resultKey = key;
  const section = $('result'); const heading = result.title || ({complete:'O futuro foi reescrito.',partial:'O crime foi impedido. A um custo.',defeat:'A visão se tornou realidade.'}[result.outcome]) || 'A verdade foi revelada.';
  const parts = [el('p','NOVA LINHA DO TEMPO','eyebrow'),el('h2',heading)];
  if (result.summary) parts.push(el('p',result.summary,'verdict'));
  if (result.culprit) parts.push(el('h3',`Responsável: ${typeof result.culprit === 'string' ? result.culprit : result.culprit.name}`));
  if (result.explanation) parts.push(el('p',result.explanation));
  if (result.evidence?.length) { const list = el('ol'); for (const evidence of result.evidence) list.append(el('li',typeof evidence === 'string' ? evidence : evidence.text)); parts.push(list); }
  if (result.accusations?.length) for (const accusation of result.accusations) { const row = el('div',undefined,'reveal-player'); row.append(el('b',accusation.name),el('span',accusation.suspectName || accusation.suspectId)); parts.push(row); }
  parts.push(el('p','Protótipo com um caso fixo. Quem já conhece a solução deve evitar dar pistas aos novos investigadores.','muted'));
  const again = el('button','Voltar ao início','primary'); again.onclick = async () => { if (await action('leave')) { clientId = randomId(); storage.set('shift-client',clientId); } }; parts.push(again); section.replaceChildren(...parts);
}
function render() {
  if (!state) return;
  show('retry-pending',!!pendingAction);
  const phase = state.phase; const phaseKey = `${phase}:${state.round}`;
  if (phaseKey !== lastPhase) { review = false; suspectsKey = ''; messagesKey = ''; $('search').value = ''; $('question').value = ''; lastPhase = phaseKey; }
  show('welcome',false); show('game',true); $('room-code').textContent = state.code;
  show('lobby',phase==='lobby'); show('active-game',!['lobby','finished'].includes(phase)); show('result',phase==='finished');
  renderPlayers(); show('recover-host', !!state.hostRecoverable && state.selfId !== state.hostId);
  $('start').disabled = state.players.length < 3; show('start',state.selfId===state.hostId);
  $('start-hint').textContent = state.selfId===state.hostId ? (state.players.length<3?'São necessários pelo menos três investigadores.':'A equipe está pronta. Podem começar.') : 'O anfitrião iniciará a investigação.';
  if (phase==='lobby') return;
  if (phase==='finished') { renderResult(); return; }
  const vision = state.vision || {};
  $('vision-title').textContent = vision.title || 'Um crime ainda pode ser impedido.';
  $('vision-description').textContent = `${vision.description || ''} Vítima: ${vision.victim || 'desconhecida'}. Local: ${vision.place || vision.location || 'desconhecido'}. Método: ${vision.method || 'desconhecido'}.`;
  $('hours').textContent = `${state.hoursRemaining}h`;
  $('round-label').textContent = phase==='accusation'?'Momento da decisão':`Turno ${state.round} de ${state.maxRounds}`;
  $('timeline').replaceChildren(...Array.from({length:state.maxRounds},(_,i)=>el('i',undefined,i<state.round?'past':'')));
  const done = state.players.find(p=>p.id===state.selfId)?.done;
  const accusing = phase==='accusation';
  $('work-title').textContent = accusing?'Quem é o assassino?':'Investigação';
  $('interview-status').textContent = accusing?'DECISÃO INDIVIDUAL':'CONVERSA PRIVADA';
  $('selection-hint').textContent = accusing?'Acuse em segredo. A escolha só será revelada quando todos decidirem.':'Escolha um suspeito. Esta é sua única entrevista neste turno.';
  show('suspect-panel',(accusing&&!state.hasAccused)||(!accusing&&!state.interview&&!done));
  show('interview-panel',!accusing&&!!state.interview&&(!done||review));
  show('waiting-panel',!accusing&&done&&!review); show('accusation-sent',accusing&&state.hasAccused);
  show('ask-form',!done&&!accusing&&(state.interview?.remaining??0)>0); show('finish',!done&&!accusing);
  document.querySelector('.question-prompts').hidden=done||accusing||(state.interview?.remaining??0)<=0;
  $('remaining').textContent = done?'Entrevista encerrada.':`${state.interview?.remaining??5} perguntas restantes. Você pode encerrar antes.`;
  const key = JSON.stringify([state.suspects,phase]); if (key!==suspectsKey) { suspectsKey=key;renderSuspects(); }
  renderInterview();renderNotes();renderHistory();
}
if (session) { show('welcome',false); show('game',true); refresh(); }
setInterval(refresh,1500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});

function renderHistory() {
  const key = JSON.stringify(state.history || []); if (key === historyKey) return; historyKey = key;
  const fragment = document.createDocumentFragment();
  for (const interview of state.history || []) {
    const person = state.suspects.find(s => s.id === interview.suspectId);
    const details = el('details'); details.append(el('summary', `Turno ${interview.round} · ${person?.name || 'Suspeito'}`));
    for (const message of interview.messages) { const bubble = el('p', `${message.role === 'user' ? 'Você' : person?.name}: ${message.text}`); details.append(bubble); }
    fragment.append(details);
  }
  $('history').replaceChildren(fragment); show('history-panel', (state.history || []).length > 0);
}
$('code').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('entry-form').requestSubmit(document.querySelector('button[value="join"]')); } });
