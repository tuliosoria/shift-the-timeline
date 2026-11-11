import test from 'node:test';
import assert from 'node:assert/strict';
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
test('route: accusation phase shows accuse', () => { assert.equal(views.screenFor(state({phase:'accusation', round:4}), local({lastSeenRound:4})), 'accuse'); });
test('route: reveal phase shows reveal', () => { assert.equal(views.screenFor(state({phase:'reveal', round:4, result:{outcome:'partial', correct:1, total:2, culpritId:'mara', solution:{motive:'Money.'}, votes:[]}}), local({lastSeenRound:4})), 'reveal'); });

test('pick has no search input', () => {
  const html = views.renderPick(state(), local());
  assert.ok(!html.includes('type="search"'));
  assert.match(html, /Who will you question\?/);
});
test('pick CTA names the selected suspect', () => {
  const html = views.renderPick(state(), local({selected:'mara'}));
  assert.match(html, /Question Martha →/);
  assert.match(html, /You get 3 questions\./);
  assert.match(html, /data-suspect="mara"[^>]*aria-pressed="true"/);
});
test('pick shows a portrait only for allowlisted ids and an initials tile otherwise', () => {
  const html = views.renderPick(state(), local());
  assert.ok(html.includes('src="/assets/portraits/mara.webp"'));
  assert.ok(!html.includes('/assets/portraits/ada.webp'));
  assert.match(html, /class="tile"[^>]*style="--tile:#7a5c3e"[^>]*>AF</);
});
test('chat counter shows "1 of 3"', () => {
  const html = views.renderChat(state({}, {interviews:[interview({messages:[message()]})]}), local());
  assert.match(html, /1 of 3/);
  assert.match(html, /In the dining car\./);
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
test('tab bar appears only during investigation and accusation', () => {
  const s = state({}, {deductions:[{id:'d1', text:'x', suspectId:'mara', round:1}]});
  const html = views.renderTabBar(s, local());
  assert.match(html, /Investigate/); assert.match(html, /Deductions/); assert.match(html, /1\/5/); assert.match(html, /Case file/);
  assert.equal(views.renderTabBar(state({phase:'lobby', round:0}), local()), '');
  assert.equal(views.renderTabBar(state({phase:'reveal'}), local()), '');
});
test('landing and lobby carry the AI notice', () => {
  const notice = "Suspects are voiced by AI. Don't type personal information.";
  assert.ok(views.renderLanding(null, local()).includes(notice.replace("'", '&#39;')));
  assert.ok(views.renderLobby(state({phase:'lobby', round:0}), local()).includes(notice.replace("'", '&#39;')));
});
test('briefing shows the prediction, the rules and Begin', () => {
  const html = views.renderBriefing(state(), local({briefingSeen:false}));
  assert.match(html, /Iona will die at 20:00 tomorrow\./);
  assert.match(html, /Begin/);
  assert.match(html, /24 hours/);
});
test('waiting names unfinished players and gives the host Advance now', () => {
  const s = state({players:[{id:'p1', name:'Ana', host:true, ready:true}, {id:'p2', name:'Léo', host:false, ready:false}]}, {interviews:[interview({closed:true, messages:[message()]})]});
  const html = views.renderWaiting(s, local());
  assert.match(html, /Waiting for: Léo/);
  assert.match(html, /Advance now/);
  assert.ok(!views.renderWaiting({...s, me:{...s.me, host:false}}, local()).includes('Advance now'));
});
test('accuse CTA summons the selected suspect', () => {
  assert.match(views.renderAccuse(state({phase:'accusation', round:4}), local({selected:'basil'})), /Summon Basil →/);
});
test('reveal shows the outcome, the culprit and per-player hits', () => {
  const s = state({phase:'reveal', round:4, result:{outcome:'partial', correct:1, total:2, culpritId:'mara', solution:{motive:'Money.'}, votes:[{playerId:'p1', suspectId:'mara', correct:true}, {playerId:'p2', suspectId:'ada', correct:false}]}});
  const html = views.renderReveal(s, local());
  assert.match(html, /Martha Vale/);
  assert.match(html, /Ana/); assert.match(html, /Léo/);
  assert.match(html, /1 of 2/);
});
