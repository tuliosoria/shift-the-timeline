import test from 'node:test';
import assert from 'node:assert/strict';
import {caseData as publicCase} from '../examples/public-demo.mjs';
import {publicAsset, readPublicAsset} from '../server/public-assets.mjs';
const views = await import('../public/views.js').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

const suspects = [
  {id:'mara', name:'Martha Vale', role:'Operations Director', initials:'MV', color:'#586c74', profile:'Runs the line.'},
  {id:'ada', name:'Ada Finch', role:'Electrical technician', initials:'AF', color:'#7a5c3e', profile:'Maintains the lights.'},
  {id:'basil', name:'Basil Wren', role:'Archivist', initials:'BW', color:'#3e5c7a', profile:'Keeps the records.'},
];
function state(over = {}, me = {}) {
  return {
    code:'ABCD2345', version:3, phase:'investigation', round:1, hostRecoverable:false, canFinalizeAccusations:false,
    config:{rounds:4, maxQuestions:3, hoursPerRound:6},
    clock:{turn:1, time:'20:00', hoursLeft:24, crimeAt:'20:00'},
    case:{id:'demo', title:'The Last Light', victim:'Iona Grey', place:'The gallery', method:'A falling model', prediction:'Iona will die at 20:00 tomorrow.'},
    suspects,
    players:[{id:'p1', name:'Ana', host:true, ready:false, selectedSuspectId:null, voteSubmitted:false}, {id:'p2', name:'Léo', host:false, ready:false, selectedSuspectId:null, voteSubmitted:false}],
    me:{id:'p1', name:'Ana', host:true, interviews:[], vote:null, deductions:[], ...me},
    deductionTotal:5,
    ...over,
  };
}
const local = (over = {}) => ({briefingSeen:true, lastSeenRound:1, tab:'investigate', selected:null, draft:'', ...over});
const interview = (over = {}) => ({round:1, suspectId:'mara', opening:'A murder? On this train?', closed:false, messages:[], ...over});
const message = (over = {}) => ({id:'m1', question:'Where were you?', status:'complete', reply:'In the dining car.', unlocked:[], ...over});

test('views module exposes the screen router and renderers', () => {
  assert.equal(typeof views.screenFor, 'function');
  for (const name of ['Landing','Lobby','Briefing','Pick','Chat','Waiting','Transition','Accuse','Reveal','Header','TabBar','Deductions']) assert.equal(typeof views['render' + name], 'function', name);
});
test('route: no room shows landing', () => { assert.equal(views.screenFor(null, local()), 'landing'); });
test('route: lobby phase shows lobby', () => { assert.equal(views.screenFor(state({phase:'lobby', round:0}), local({briefingSeen:false, lastSeenRound:0})), 'lobby'); });
test('route: investigation before the briefing is seen shows briefing', () => { assert.equal(views.screenFor(state(), local({briefingSeen:false, lastSeenRound:0})), 'briefing'); });
test('route: a new turn not yet seen shows the transition when no reply of mine is pending', () => {
  const s = state({round:2, clock:{turn:2, time:'02:00', hoursLeft:18, crimeAt:'20:00'}}, {interviews:[interview({closed:true, messages:[message(), message({id:'m2'}), message({id:'m3'})]})]});
  assert.equal(views.screenFor(s, local({lastSeenRound:1})), 'transition');
  const pending = state({round:2}, {interviews:[interview({closed:true, messages:[message(), message({id:'m2'}), message({id:'m3', status:'pending', reply:null})]})]});
  assert.notEqual(views.screenFor(pending, local({lastSeenRound:1})), 'transition');
});
test('route: investigation without a current interview shows pick', () => { assert.equal(views.screenFor(state(), local()), 'pick'); });
test('route: an open current interview shows chat', () => { assert.equal(views.screenFor(state({}, {interviews:[interview({messages:[message()]})]}), local()), 'chat'); });
test('route: a closed interview whose last message is pending still shows chat', () => {
  const s = state({}, {interviews:[interview({closed:true, messages:[message(), message({id:'m2'}), message({id:'m3', status:'pending', reply:null})]})]});
  assert.equal(views.screenFor(s, local()), 'chat');
});
test('route: a closed interview stays on chat while the player reads the last reply', () => {
  const s = state({}, {interviews:[interview({closed:true, messages:[message(), message({id:'m2'}), message({id:'m3'})]})]});
  assert.equal(views.screenFor(s, local({reading:'1:mara'})), 'chat');
  assert.equal(views.screenFor(s, local({reading:'1:ada'})), 'waiting');
  assert.match(views.renderChat(s, local({reading:'1:mara'})), /That's all your questions for this turn\./);
});
test('route: a closed current interview shows waiting', () => {
  const s = state({}, {interviews:[interview({closed:true, messages:[message(), message({id:'m2'}), message({id:'m3'})]})]});
  assert.equal(views.screenFor(s, local()), 'waiting');
});
test('route: accusation phase shows accuse once time is up has been seen', () => {
  assert.equal(views.screenFor(state({phase:'accusation', round:4}), local({lastSeenRound:4})), 'transition');
  assert.equal(views.screenFor(state({phase:'accusation', round:4}), local({lastSeenRound:5})), 'accuse');
  assert.equal(views.screenFor(state({phase:'accusation', round:4}), local({lastSeenRound:2})), 'transition', 'a returning player sees one transition');
});
test('route: the transition waits while I read my previous-turn last reply', () => {
  const done = interview({closed:true, messages:[message(), message({id:'m2'}), message({id:'m3'})]});
  const s = state({round:2, clock:{turn:2, time:'02:00', hoursLeft:18, crimeAt:'20:00'}}, {interviews:[done]});
  assert.equal(views.screenFor(s, local({lastSeenRound:1, reading:'1:mara'})), 'chat');
  assert.equal(views.currentInterview(s, local({lastSeenRound:1, reading:'1:mara'})), done);
  assert.match(views.renderChat(s, local({lastSeenRound:1, reading:'1:mara'})), /That's all your questions for this turn\./);
  assert.equal(views.screenFor(s, local({lastSeenRound:1, reading:null})), 'transition');
  assert.equal(views.screenFor(s, local({lastSeenRound:2, reading:'1:mara'})), 'pick', 'after the transition an old chat never comes back');
  const last = state({phase:'accusation', round:4}, {interviews:[interview({round:4, closed:true, messages:[message(), message({id:'m2'}), message({id:'m3', status:'pending', reply:null})]})]});
  assert.equal(views.screenFor(last, local({lastSeenRound:4})), 'chat', 'the last turn reply is seen before the summons');
});
test('transition shows hours later and the new time, or time is up before the summons', () => {
  const html = views.renderTransition(state({round:2, clock:{turn:2, time:'02:00', hoursLeft:18, crimeAt:'20:00'}}), local({lastSeenRound:1}));
  assert.match(html, /6 hours later/);
  assert.match(html, /02:00/);
  assert.match(html, /data-action="continue"/);
  const up = views.renderTransition(state({phase:'accusation', round:4, clock:{turn:4, time:'14:00', hoursLeft:0, crimeAt:'20:00'}}), local({lastSeenRound:4}));
  assert.match(up, /Time&#39;s up/, 'the title is escaped');
  assert.match(up, /20:00/);
  assert.match(up, /Summon your suspect/);
  assert.equal(views.stageOf(state({round:3})), 3);
  assert.equal(views.stageOf(state({phase:'accusation', round:4})), 5);
});
test('route: reveal phase shows reveal', () => { assert.equal(views.screenFor(state({phase:'reveal', round:4, result:{outcome:'partial', correct:1, total:2, culpritId:'mara', solution:{motive:'Money.'}, votes:[]}}), local({lastSeenRound:4})), 'reveal'); });

test('pick has no search input', () => {
  const html = views.renderPick(state(), local());
  assert.ok(!html.includes('type="search"'));
  assert.match(html, /Who will you question\?/);
});
test('pick CTA names the selected suspect', () => {
  const html = views.renderPick(state(), local({selected:'mara'}));
  assert.match(html, /Question Martha Vale →/);
  assert.match(html, /You get 3 questions\./);
  assert.match(html, /data-suspect="mara"[^>]*aria-pressed="true"/);
});
test('pick shows a portrait only for allowlisted ids and an initials tile otherwise', () => {
  const html = views.renderPick(state(), local());
  assert.ok(html.includes('src="/assets/portraits/mara.webp"'));
  assert.ok(!html.includes('/assets/portraits/ada.webp'));
  assert.match(html, /class="tile"[^>]*style="--tile:#7a5c3e"[^>]*>AF</);
});
test('every public-demo suspect has a distinct shipped portrait in pick, chat and accusation', async () => {
  const demo = state({case: publicCase, suspects: publicCase.suspects});
  const portraits = new Set();
  for (const person of publicCase.suspects) {
    const single = {...demo, suspects: [person]};
    const pick = views.renderPick(single, local());
    const src = pick.match(/<img[^>]+src="([^"]+)"/)?.[1];
    assert.ok(src, `Missing portrait for ${person.id}`);
    portraits.add(src);
    const asset = publicAsset(src);
    assert.equal(asset?.type, 'image/webp', `Portrait is served: ${person.id}`);
    assert.ok((await readPublicAsset(asset.file)).length > 0);
    const chat = views.renderChat({...single, me: {...single.me, interviews: [interview({suspectId: person.id})]}}, local());
    assert.ok(chat.includes(`src="${src}"`), 'chat retains the same face');
    const accuse = views.renderAccuse({...single, phase: 'accusation'}, local());
    assert.ok(accuse.includes(`src="${src}"`), 'accusation retains the same face');
    const sealed = views.renderAccuse({...single, phase: 'accusation', me: {...single.me, vote: person.id}}, local());
    assert.ok(sealed.includes(`src="${src}"`), 'sealed vote retains the same face');
    const reveal = views.renderReveal({...single, phase: 'reveal', result: {outcome: 'complete', correct: 1, total: 1, culpritId: person.id, votes: []}}, local());
    assert.ok(reveal.includes(`src="${src}"`), 'reveal retains the same face');
  }
  assert.equal(portraits.size, publicCase.suspects.length, 'each suspect is visually distinct');
});
test('unknown public-demo suspects retain the safe initials fallback', () => {
  for (const id of ['new-suspect', '../../private/secret', 'constructor', 'toString']) {
    const html = views.renderPick(state({case: publicCase, suspects: [{id, name: 'New Suspect', initials: 'NS'}]}), local());
    assert.ok(!html.includes('<img'));
    assert.match(html, /class="tile"[^>]*>NS</);
  }
});
test('chat counter shows "1 of 3"', () => {
  const html = views.renderChat(state({}, {interviews:[interview({messages:[message()]})]}), local());
  assert.match(html, /1 of 3/);
  assert.match(html, /In the dining car\./);
});
test('the question box stops at the server limit of 300 characters', () => {
  const html = views.renderChat(state({}, {interviews:[interview()]}), local());
  assert.match(html, /<textarea id="question"[^>]*maxlength="300"/);
});
test('escapes suspect names', () => {
  const hostile = state({suspects:[{...suspects[0], id:'../../private/secret', name:'<img src=x onerror=alert(1)> Eve', initials:'<b>', color:'red;background:url(x)'}]});
  for (const html of [views.renderPick(hostile, local({selected:'../../private/secret'})), views.renderAccuse({...hostile, phase:'accusation'}, local({selected:'../../private/secret'}))]) {
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!html.includes('/assets/portraits/../../'));
    assert.ok(!html.includes('url(x)'));
  }
});
test('deductions view lists unlocked texts and shows locked count as total-unlocked padlocks', () => {
  const s = state({deductionTotal:5}, {deductions:[{id:'d1', text:'The weapon is not on this carriage.', suspectId:'mara', round:1}, {id:'d2', text:'Ada has <no> motive.', suspectId:'ada', round:2}]});
  const html = views.renderDeductions(s);
  assert.match(html, /The weapon is not on this carriage\./);
  assert.match(html, /Ada has &lt;no&gt; motive\./);
  assert.match(html, /2 of 5 unlocked/);
  assert.equal(html.match(/class="locked"/g)?.length, 3);
});
test('header shows the case title and the story clock', () => {
  const html = views.renderHeader(state({round:2, clock:{turn:2, time:'02:00', hoursLeft:18, crimeAt:'20:00'}}), local());
  assert.match(html, /The Last Light/);
  assert.match(html, /Turn 2 of 4 · 02:00 · 18h left/);
});
test('tab bar keeps private evidence available through the reveal', () => {
  const s = state({}, {deductions:[{id:'d1', text:'x', suspectId:'mara', round:1}]});
  const html = views.renderTabBar(s, local());
  assert.match(html, /Investigate/); assert.match(html, /Deductions/); assert.match(html, /1\/5/); assert.match(html, /Case file/);
  assert.equal(views.renderTabBar(state({phase:'lobby', round:0}), local()), '');
  assert.match(views.renderTabBar(state({phase:'reveal'}), local()), /Outcome.*Deductions.*Case file/);
});
test('landing and lobby carry the AI notice when the server reports AI mode', () => {
  const notice = "Suspects are voiced by AI. Don't type personal information.";
  assert.ok(views.renderLanding(null, local({dialogueMode:'ai'})).includes(notice.replace("'", '&#39;')));
  assert.ok(views.renderLobby(state({phase:'lobby', round:0}), local({dialogueMode:'ai'})).includes(notice.replace("'", '&#39;')));
});
test('briefing shows the prediction, the rules and Begin', () => {
  const html = views.renderBriefing(state(), local({briefingSeen:false}));
  assert.match(html, /Iona will die at 20:00 tomorrow\./);
  assert.match(html, /Begin/);
  assert.match(html, /24 story hours/);
});
const finished = (over = {}) => state({players:[{id:'p1', name:'Ana', host:true, ready:true}, {id:'p2', name:'Léo', host:false, ready:false}, {id:'p3', name:'Maya Stone', host:false, ready:false}, {id:'p4', name:'Rui', host:false, ready:true}], ...over}, {interviews:[interview({closed:true, messages:[message()]})]});
test('waiting lists unfinished players by name', () => {
  const html = views.renderWaiting(finished(), local());
  assert.match(html, /Waiting for: Léo, Maya Stone/);
  assert.ok(!html.includes('Rui'), 'finished players are not listed');
  const all = views.renderWaiting(finished({players:[{id:'p1', name:'Ana', host:true, ready:true}, {id:'p2', name:'Léo', host:false, ready:true}]}), local());
  assert.ok(!all.includes('Waiting for'));
  assert.match(views.renderWaiting(finished({players:[{id:'p1', name:'Ana', host:true, ready:true}, {id:'p2', name:'<b>Eve</b>', host:false, ready:false}]}), local()), /Waiting for: &lt;b&gt;Eve&lt;\/b&gt;/);
});
test('host sees Advance now only as host', () => {
  const s = finished();
  assert.match(views.renderWaiting(s, local()), /data-action="advance"[^>]*>Advance now</);
  const guest = {...s, me:{...s.me, id:'p2', host:false}};
  assert.ok(!views.renderWaiting(guest, local()).includes('Advance now'));
  assert.ok(!views.renderWaiting(guest, local()).includes('data-action="advance"'));
  assert.match(views.ADVANCE_CONFIRM.body, /loses their remaining questions/);
});
test('accuse CTA summons the selected suspect', () => {
  assert.match(views.renderAccuse(state({phase:'accusation', round:4}), local({selected:'basil'})), /Summon Basil Wren →/);
});
test('accuse requires confirm text "This cannot be undone."', () => {
  const c = views.summonConfirmation(suspects[2]);
  assert.equal(c.title, 'Summon Basil Wren?');
  assert.equal(c.label, 'Summon Basil');
  assert.match(c.body, /This cannot be undone\./);
  assert.match(views.summonConfirmation({...suspects[0], name:'<i>Eve</i> Doe'}).body, /&lt;i&gt;Eve&lt;\/i&gt;/);
  assert.match(views.renderAccuse(state({phase:'accusation', round:4}), local({selected:'basil'})), /This cannot be undone\./);
});
test('reveal shows who got it right', () => {
  const players = [...state().players, {id:'p3', name:'Maya', host:false}];
  const s = state({phase:'reveal', round:4, players, result:{outcome:'partial', correct:1, total:3, culpritId:'mara', solution:{motive:'Money.'}, votes:[{playerId:'p1', suspectId:'mara', correct:true}, {playerId:'p2', suspectId:'ada', correct:false}, {playerId:'p3', suspectId:null, correct:false}]}});
  const html = views.renderReveal(s, local());
  assert.match(html, /The timeline wavers\./);
  assert.match(html, /1 of 3 summoned the killer\./);
  assert.match(html, /class="hit"><b>Ana <small>\(you\)<\/small><\/b><span>Martha Vale<\/span>.*Got it right/);
  assert.match(html, /class="miss"><b>Léo<\/b><span>Ada Finch<\/span>.*Wrong suspect/);
  assert.match(html, /class="miss"><b>Maya<\/b><span>No summons<\/span>.*No summons/);
});
test('reveal shows the outcome, the culprit and per-player hits', () => {
  const s = state({phase:'reveal', round:4, result:{outcome:'partial', correct:1, total:2, culpritId:'mara', solution:{motive:'Money.'}, votes:[{playerId:'p1', suspectId:'mara', correct:true}, {playerId:'p2', suspectId:'ada', correct:false}]}});
  const html = views.renderReveal(s, local());
  assert.match(html, /Martha Vale/);
  assert.match(html, /Ana/); assert.match(html, /Léo/);
  assert.match(html, /1 of 2/);
});

// Lobby players have no tab bar, so recovery must be reachable in the lobby itself.
test('lobby exposes confirmed host recovery only for an eligible non-host', () => {
  const lobby = state({phase:'lobby', round:0, hostRecoverable:true}, {id:'p2', host:false});
  assert.equal(views.renderTabBar(lobby, local()), '');
  assert.match(views.renderLobby(lobby, local()), /data-action="claimHost" data-submit/);
  assert.match(views.renderLobby(lobby, local()), /away for two minutes/);
  assert.doesNotMatch(views.renderLobby({...lobby, hostRecoverable:false}, local()), /data-action="claimHost"/);
  assert.doesNotMatch(views.renderLobby({...lobby, me:{...lobby.me, host:true}}, local()), /data-action="claimHost"/);
});


test('room switching is explicit, preserves the seat and warns the host', () => {
  const host = state();
  assert.match(views.renderLobby(host, local()), /data-action="switch-room" data-submit/);
  assert.match(views.renderCaseFile(host), /data-action="switch-room" data-submit/);
  const choice = views.switchRoomConfirmation(host, 'EFGH6789');
  assert.match(choice.title, /EFGH6789/);
  assert.match(choice.body, /ABCD2345/);
  assert.match(choice.body, /Your seat stays/);
  assert.match(choice.body, /does not pause or extend/);
  assert.match(choice.body, /another agent can take over after two minutes/);
  assert.doesNotMatch(views.switchRoomConfirmation(state({}, {host:false})).body, /You are the host/);
  assert.doesNotMatch(views.switchRoomConfirmation(state({code:'<script>'}), '<b>').body, /<script>|<b><b>/);
});

test('landing offers a saved seat only when a resume target exists', () => {
  assert.doesNotMatch(views.renderLanding(null, local()), /data-action="resume"/);
  const html = views.renderLanding(null, local({resume:{code:'ABCD2345'}}));
  assert.match(html, /data-action="resume" data-submit/);
  assert.match(html, /Return to room ABCD2345/);
  assert.match(html, /while the room is still available/);
});


test('replay preserves the completed investigation instead of offering a destructive reset', () => {
  const s = state({phase:'reveal', result:{outcome:'defeat', correct:0, total:2, culpritId:'mara', solution:{}, votes:[]}});
  const html = views.renderReveal(s, local());
  assert.match(html, /data-action="new-investigation" data-submit/);
  assert.doesNotMatch(html, /data-action="reset"/);
  assert.match(html, /private drafts are kept/);
  assert.match(html, /while it remains available/);
});

test('repeat reminder matches exact normalised question only in own same-suspect resolved history', () => {
  const prior = interview({closed:true, messages:[message({question:'Where  were you?'})]});
  const current = interview({round:2});
  const s = state({round:2}, {interviews:[prior, current]});
  const l = local({lastSeenRound:2});
  assert.equal(views.previousQuestion(s, l, '  WHERE\nwere you? ').message.id, 'm1');
  for (const text of ['', 'Where were you yesterday?', 'Where were you']) assert.equal(views.previousQuestion(s, l, text), null);
  assert.match(views.renderQuestionReminder(s, l, 'Where were you?'), /Asked in Turn 1/);
  assert.match(views.renderQuestionReminder(s, l, 'Where were you?'), /You can still send it again/);
  current.suspectId = 'ada';
  assert.equal(views.previousQuestion(s, l, 'Where were you?'), null);
});
test('repeat reminder ignores pending questions and selects newest resolved answer', () => {
  const s = state({}, {interviews:[interview({messages:[message(), message({id:'new', status:'canonical'}), message({id:'pending',status:'pending',reply:null})]})]});
  assert.equal(views.previousQuestion(s, local(), 'Where were you?').message.id, 'new');
  s.me.interviews[0].messages = [message({status:'pending',reply:null})];
  assert.equal(views.previousQuestion(s, local(), 'Where were you?'), null);
});
test('repeat reminders escape private identifiers and provide direct return from source review', () => {
  const s = state({}, {interviews:[interview({messages:[message({id:'<script>'})]})]});
  const html = views.renderQuestionReminder(s, local(), 'Where were you?');
  assert.match(html, /data-previous-question="&lt;script&gt;"/);
  const review = views.renderDeductions(s, {notebook:{suspect:'mara',interview:'1:mara',message:'<script>',directAnswer:true}});
  assert.match(review, /data-action="dossier-return">Return to Investigate/);
});

test('early interview closure explains unused questions and links only an existing draft', () => {
  for (const count of [0, 1, 2]) {
    const s = state({round:2}, {interviews:[interview({closed:true,messages:Array.from({length:count},(_,n)=>message({id:`m${n}`}))})]});
    const l = local({reading:'1:mara',draft:'Private unfinished thought'});
    const html = views.renderChatFooter(s,l);
    assert.match(html, new RegExp(`${3-count} question`));
    assert.match(html, /The host advanced the turn/);
    assert.match(html, /data-review-draft="1:mara"/);
    assert.doesNotMatch(html, /Private unfinished thought|That's all/);
    assert.doesNotMatch(views.renderChatFooter(s,{...l,draft:''}), /data-review-draft/);
  }
});
test('pending interrupted replies keep their composer until resolved; fully used turns keep normal ending', () => {
  const i = interview({closed:true,messages:[message({status:'pending',reply:null})]});
  const s = state({round:2},{interviews:[i]}), l = local({reading:'1:mara',draft:'Saved'});
  assert.match(views.renderChatFooter(s,l), /id="question".*readonly/);
  assert.doesNotMatch(views.renderChatFooter(s,l), /questions? left/);
  i.messages = [message(),message({id:'m2'}),message({id:'m3'})];
  assert.equal(views.renderChatFooter(s,l), views.CHAT_DONE);
});
