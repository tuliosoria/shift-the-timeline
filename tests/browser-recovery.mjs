// Real-browser recovery regression against synthetic content; no production services.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
import {createServer} from '../server/http.mjs';
import {createApi} from '../server/api.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {Sessions} from '../server/sessions.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';
let now=Date.now(),api;
const store=new MemoryStore();
const server=createServer({api:(...args)=>api(...args),origin:'http://127.0.0.1'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
api=createApi({game:new DurableGame({store,caseData:TRAIN_CASE,catalog:CASES,now:()=>now}),sessions:new Sessions({store,secure:false,now:()=>now}),allowedOrigin:origin,rateLimit:async()=>{},dialogueMode:'optional-openai'});
const browser=await chromium.launch({headless:true});
try {
 const pages=[],errors=[];
 for(let i=0;i<3;i++){const context=await browser.newContext({viewport:{width:i===1?390:1440,height:900}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForSelector('#create-name');pages.push(page);}
 const call=(p,path,body)=>p.evaluate(async({path,body})=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;},{path,body});
 await pages[0].fill('#create-name','Original host');await pages[0].click('#create-form button');await pages[0].waitForSelector('.selectable-code');
 const code=(await pages[0].locator('.selectable-code').textContent()).trim();
 for(let i=1;i<3;i++){const joined=await call(pages[i],`/api/rooms/${code}/join`,{id:randomUUID(),name:`Agent ${i}`});await pages[i].evaluate(s=>localStorage.setItem('shift-session',JSON.stringify(s)),{code,playerId:joined.playerId});await pages[i].reload();await pages[i].waitForSelector('.selectable-code');}
 const act=(p,type,extra={})=>call(p,`/api/rooms/${code}/actions`,{id:randomUUID(),type,...extra});
 await pages[0].waitForFunction(()=>!document.querySelector('[data-action=start]').disabled);await pages[0].click('[data-action=start]');
 // Canonical topics remain private and repeat attempts cannot waste a slot.
 await act(pages[1],'select',{round:1,suspectId:'suspect-1'});
 await act(pages[1],'ask',{round:1,question:'Where were you?',topic:'alibi'});
 // Find public profile details and spread interviews without reading private answers.
 await pages[2].waitForSelector('#suspect-search');
 await pages[2].fill('#suspect-search','  DEVELOPMENT  ');
 assert.equal(await pages[2].inputValue('#suspect-search'),'  DEVELOPMENT  ');
 assert.equal(await pages[2].evaluate(()=>document.activeElement.id),'suspect-search');
 await pages[2].selectOption('#suspect-filter','unassigned');
 await pages[2].waitForFunction(()=>document.querySelector('#suspect-results')?.textContent==='14 of 15 public dossiers');
 assert.equal(await pages[2].locator('[data-action=dossier][data-id="suspect-1"]').count(),0);
 await pages[2].fill('#suspect-search','<img onerror=globalThis.searchExecuted=true>');
 assert.equal(await pages[2].locator('#suspect-results').textContent(),'0 of 15 public dossiers');
 assert.match(await pages[2].locator('.suspect-grid').textContent(),/No public dossiers match/);
 assert.equal(await pages[2].evaluate(()=>globalThis.searchExecuted===true),false);
 await pages[2].click('[data-action=clear-suspect-search]');
 assert.equal(await pages[2].evaluate(()=>document.activeElement.id),'suspect-search');
 assert.equal(await pages[2].inputValue('#suspect-search'),'');
 assert.equal(await pages[2].inputValue('#suspect-filter'),'all');
 assert.equal(await pages[2].locator('#suspect-results').textContent(),'15 of 15 public dossiers');
 for(const width of [320,390,1440]){await pages[2].setViewportSize({width,height:900});await pages[2].fill('#suspect-search','development');assert.equal(await pages[2].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await pages[2].setViewportSize({width:390,height:900});
 await pages[2].selectOption('#suspect-filter','unassigned');
 await pages[2].locator('[data-action=dossier]').first().click();
 const selectedDossier=await pages[2].locator('#dossier-detail h2').textContent();
 await pages[2].locator('[data-stage=deduce]').first().click();
 await pages[2].locator('[data-stage=analyse]').first().click();
 assert.equal(await pages[2].inputValue('#suspect-search'),'development');
 assert.equal(await pages[2].inputValue('#suspect-filter'),'unassigned');
 assert.equal(await pages[2].locator('#dossier-detail h2').textContent(),selectedDossier);
 assert.equal((await pages[2].evaluate(async code=>(await fetch(`/api/rooms/${code}`)).json(),code)).me.interviews.length,0);
 await pages[2].screenshot({path:'/tmp/shift-recovery-dossier-discovery-mobile.png',fullPage:true});
 // Read adjacent matching dossiers without scrolling back through the whole list.
 assert.equal(await pages[2].locator('[data-action=browse-dossier][data-id=previous]').isDisabled(),true);
 await pages[2].locator('[data-action=browse-dossier][data-id=next]').focus();
 await pages[2].keyboard.press('Enter');
 assert.equal(await pages[2].locator('#dossier-detail h2').textContent(),'Character 2');
 assert.equal(await pages[2].evaluate(()=>document.activeElement.id),'dossier-detail');
 assert.match(await pages[2].locator('.dossier-position').textContent(),/Dossier 2 of 14 matching/);
 await pages[2].click('[data-action=return-to-suspects]');
 assert.equal(await pages[2].evaluate(()=>document.activeElement.dataset.id),'suspect-2');
 const cardPosition=await pages[2].locator('[data-action=dossier][data-id="suspect-2"]').boundingBox();
 assert.ok(cardPosition.y>=0&&cardPosition.y+cardPosition.height<=900);
 await pages[2].keyboard.press('Enter');
 await pages[2].click('[data-action=browse-dossier][data-id=previous]');
 assert.equal(await pages[2].locator('#dossier-detail h2').textContent(),'Character 0');
 for(const width of [320,390,1440]){await pages[2].setViewportSize({width,height:900});assert.equal(await pages[2].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await pages[2].setViewportSize({width:390,height:900});
 await pages[2].locator('#dossier-detail').screenshot({path:'/tmp/shift-recovery-dossier-browsing-mobile.png'});
 await pages[2].fill('#suspect-search','Character 14');
 assert.match(await pages[2].locator('.dossier-position').textContent(),/outside your current filters/);
 assert.equal(await pages[2].locator('[data-action=browse-dossier][data-id=previous]').isDisabled(),true);
 assert.equal(await pages[2].locator('[data-action=browse-dossier][data-id=next]').isDisabled(),true);
 await pages[2].click('[data-action=return-to-suspects]');
 assert.equal(await pages[2].evaluate(()=>document.activeElement.id),'suspect-search');
 await pages[2].click('[data-action=dossier][data-id="suspect-14"]');
 assert.match(await pages[2].locator('.dossier-position').textContent(),/Dossier 1 of 1 matching/);
 assert.equal(await pages[2].locator('[data-action=browse-dossier][data-id=next]').isDisabled(),true);
 assert.equal((await pages[2].evaluate(async code=>(await fetch(`/api/rooms/${code}`)).json(),code)).me.interviews.length,0);

 await pages[2].click('[data-action=clear-suspect-search]');

 // Inject only a synthetic completed voice into the in-memory fixture: no provider or external API.
 const inventedVoice='FABRICATED VOICE: an invented witness contradicts the record. <img src=x onerror="globalThis.voiceExecuted=true">';
 const fixtureRoom=store.rooms.get(code),fixturePlayer=fixtureRoom.players.find(p=>p.name==='Agent 1');
 const fixtureMessage=fixturePlayer.interviews[0].messages[0],canonicalAnswer=fixtureMessage.answer;
 fixtureMessage.narration={status:'complete',text:inventedVoice};fixtureRoom.version++;
 await pages[1].reload();await pages[1].locator('[data-stage=interrogate]').first().click();
 await pages[1].waitForSelector('[data-action=review-topic][data-id=alibi]');
 let asks=0;pages[1].on('request',r=>{if(r.url().endsWith('/actions')&&r.postDataJSON()?.type==='ask')asks++;});
 await pages[1].click('[data-action=review-topic][data-id=alibi]');
 assert.equal(asks,0);assert.match(await pages[1].evaluate(()=>document.activeElement.id),/^answer-/);
 await pages[1].fill('#question','Where were you yesterday?');
 assert.match(await pages[1].locator('#topic-hint').textContent(),/Already covered/);
 await pages[1].click('#question-form button');await pages[1].waitForFunction(()=>document.querySelector('#notice').textContent.includes('already covered'));
 assert.equal(await pages[1].inputValue('#question'),'Where were you yesterday?');
 assert.equal(await pages[1].locator('.bubble.question').count(),1);
 // Freeform voice remains visible but clearly unverified, escaped and separate from case evidence.
 const answer=pages[1].locator(`#answer-${fixtureMessage.id}`),voice=answer.getByRole('note',{name:'Unverified AI voice'});
 await voice.waitFor();assert.match(await voice.textContent(),/AI voice may invent or contradict facts/);
 assert.match(await voice.textContent(),/Use case evidence for deductions/);
 assert.ok((await voice.textContent()).includes(inventedVoice));assert.equal(await voice.locator('img').count(),0);
 assert.equal(await pages[1].evaluate(()=>globalThis.voiceExecuted===true),false);
 assert.equal(await answer.locator('.record-label').textContent(),'Case evidence');
 assert.ok((await answer.textContent()).includes(canonicalAnswer));
 await answer.locator('[data-action=share]').click();
 await pages[1].waitForSelector('#confirm-body .canonical-preview');
 assert.equal(await pages[1].locator('#confirm-body .canonical-preview').textContent(),canonicalAnswer);
 assert.equal((await pages[1].locator('#confirm-body').textContent()).includes('FABRICATED VOICE'),false);
 await pages[1].click('#confirm-accept');
 await pages[1].waitForFunction(id=>document.querySelector(`#answer-${id} .share-button`)?.dataset.locked==='true',fixtureMessage.id);
 const peerState=await pages[2].evaluate(async code=>(await fetch(`/api/rooms/${code}`)).json(),code);
 assert.equal(peerState.board[0].text,canonicalAnswer);assert.equal(JSON.stringify(peerState).includes('FABRICATED VOICE'),false);
 await pages[2].reload();await pages[2].locator('[data-stage=deduce]').first().click();
 await pages[2].waitForFunction(text=>document.body.textContent.includes(text),canonicalAnswer);
 assert.equal((await pages[2].locator('body').textContent()).includes('FABRICATED VOICE'),false);
 assert.equal(await pages[2].locator('[aria-label="Unverified AI voice"]').count(),0);
 assert.equal(store.rooms.get(code).players.find(p=>p.name==='Agent 1').interviews[0].messages[0].answer,canonicalAnswer);
 // The static footer must not deny optional AI while generated voice is visible.
 assert.match(await pages[1].locator('footer').textContent(),/FIXED CASE EVIDENCE · PRIVATE INTERVIEWS/);
 assert.doesNotMatch(await pages[1].locator('footer').textContent(),/NO GENERATIVE AI/);
 // Optional external narration is explicit per question and never selected by default.
 assert.equal(await pages[1].locator('[name=aiConsent]').isChecked(),false);
 await pages[1].fill('#question','Who had clearance at the time?');
 assert.match(await pages[1].locator('#topic-hint').textContent(),/Alibi.*Already covered/);
 await pages[1].selectOption('#question-topic','clue');
 assert.match(await pages[1].locator('#topic-hint').textContent(),/Observations.*One question/);
 assert.equal(await pages[1].inputValue('#question'),'Who had clearance at the time?');
 let sent=pages[1].waitForRequest(r=>r.url().endsWith('/actions')&&r.postDataJSON()?.type==='ask');
 await pages[1].click('#question-form button');const targeted=(await sent).postDataJSON();assert.equal(targeted.aiConsent,undefined);assert.equal(targeted.question,'Who had clearance at the time?');assert.equal(targeted.topic,'clue');
 await pages[1].waitForFunction(()=>document.querySelectorAll('.bubble.question').length===2);
 assert.equal(await pages[1].inputValue('#question-topic'),'');
 await pages[1].fill('#question','What was at stake?');await pages[1].check('[name=aiConsent]');
 sent=pages[1].waitForRequest(r=>r.url().endsWith('/actions')&&r.postDataJSON()?.type==='ask');
 await pages[1].click('#question-form button');assert.equal((await sent).postDataJSON().aiConsent,true);
 await pages[1].waitForFunction(()=>document.querySelectorAll('.bubble.question').length===3);
 assert.equal(await pages[1].locator('[name=aiConsent]').isChecked(),false);
 await pages[1].screenshot({path:'/tmp/shift-recovery-topic-guidance.png',fullPage:true});
 // Observe the real scheduled presence request, not just a manual test command.
 await pages[1].waitForRequest(r=>r.url().endsWith('/actions')&&r.postDataJSON()?.type==='heartbeat',{timeout:35000});
 // Original host is genuinely disconnected, not silently removed.
 await pages[0].close();now+=121000;await act(pages[1],'heartbeat');
 await pages[1].waitForSelector('[data-action=claimHost]');await pages[1].click('[data-action=claimHost]');await pages[1].click('#confirm-cancel');
 await pages[1].click('[data-action=claimHost]');await pages[1].click('#confirm-accept');await pages[1].waitForSelector('#host-panel');
 for(let round=1;round<=3;round++)await act(pages[1],'advance',{round,confirmed:true});
 // Before an irreversible accusation, review full private history even with no round-3 interview.
 await pages[1].reload();await pages[1].waitForSelector('#vote-form');
 await pages[1].check(`#vote-form input[value="${TRAIN_CASE.culpritId}"]`);
 let reviewAsks=0;pages[1].on('request',r=>{if(r.url().endsWith('/actions')&&r.postDataJSON()?.type==='ask')reviewAsks++;});
 await pages[1].locator('.review-nav [data-stage=interrogate]').click();
 await pages[1].waitForSelector('.transcript');
 assert.equal(await pages[1].locator('#question-form').count(),0);
 assert.equal(await pages[1].locator('.review-nav [aria-current=page]').count(),1);
 assert.match(await pages[1].locator('.transcript').textContent(),/Who had clearance at the time\?/);
 assert.equal(await pages[1].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const unshared=store.rooms.get(code).players.find(p=>p.name==='Agent 1').interviews[0].messages[1];
 const beforeReviewPeer=await pages[2].evaluate(async code=>(await fetch(`/api/rooms/${code}`)).json(),code);
 assert.equal(beforeReviewPeer.board.some(n=>n.messageId===unshared.id),false);
 assert.equal(beforeReviewPeer.me.interviews.length,0);
 await pages[1].locator(`#answer-${unshared.id} [data-action=share]`).click();
 assert.equal(await pages[1].locator('#confirm-body .canonical-preview').textContent(),unshared.answer);
 await pages[1].click('#confirm-accept');
 await pages[1].waitForFunction(id=>document.querySelector(`#answer-${id} .share-button`)?.dataset.locked==='true',unshared.id);
 const afterReviewPeer=await pages[2].evaluate(async code=>(await fetch(`/api/rooms/${code}`)).json(),code);
 assert.equal(afterReviewPeer.board.find(n=>n.messageId===unshared.id)?.text,unshared.answer);
 assert.equal(afterReviewPeer.me.interviews.length,0);
 assert.equal(reviewAsks,0);
 await pages[1].screenshot({path:'/tmp/shift-accusation-review-mobile.png',fullPage:true});
 await pages[1].locator('.review-nav [data-stage=analyse]').click();
 assert.equal(await pages[1].locator(`#vote-form input[value="${TRAIN_CASE.culpritId}"]`).isChecked(),true);
 await act(pages[1],'vote',{suspectId:TRAIN_CASE.culpritId});await act(pages[2],'vote',{suspectId:TRAIN_CASE.culpritId});
 await pages[1].reload();await pages[1].waitForSelector('.review-nav');assert.equal(await pages[1].locator('[data-action=finalizeAccusations]').count(),0);
 now+=121000;await act(pages[1],'heartbeat');await pages[1].waitForSelector('[data-action=finalizeAccusations]');
 await pages[1].click('[data-action=finalizeAccusations]');assert.match(await pages[1].locator('#confirm-body').textContent(),/abstentions/);await pages[1].click('#confirm-accept');await pages[1].waitForSelector('.reveal');
 assert.match(await pages[1].locator('.verdicts').textContent(),/Original host.*No accusation submitted.*Abstention/);
 assert.match(await pages[1].locator('.result-stats').textContent(),/0 innocent people arrested/);
 assert.match(await pages[1].locator('.reveal').textContent(),/PARTIAL VICTORY/);
 assert.equal(await pages[1].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await pages[1].screenshot({path:'/tmp/shift-recovery-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: escaped unverified AI voice, canonical-only share and peer isolation; browser host takeover, cancel/confirm, preserved roster, missing-vote grace, explicit abstention reveal, mobile overflow, no page errors.');
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
