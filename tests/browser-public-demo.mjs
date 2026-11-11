// Authored-route regression, NOT a blind solver or a semantic/difficulty evaluation.
// All gameplay uses browser controls against a local MemoryStore; no AI, credentials or external services.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from '../server/http.mjs';
import {createApi} from '../server/api.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {Sessions} from '../server/sessions.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {caseData,catalog,reviewRoutes} from '../examples/public-demo.mjs';
const data=validateCase({caseData,catalog}),store=new MemoryStore();let api,browser;
const server=createServer({api:(...args)=>api(...args),origin:'http://127.0.0.1'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
api=createApi({game:new DurableGame({store,...data}),sessions:new Sessions({store,secure:false}),allowedOrigin:origin,rateLimit:async()=>{}});
const pages=[],errors=[],external=[],actions=[],joins=[];
const overflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal viewport overflow');
const navigate=async(page,stage)=>{await page.locator(`[data-stage="${stage}"]`).first().click();};
const confirm=async page=>{await page.locator('#confirm-dialog[open]').waitFor();await page.locator('#confirm-accept').click();await page.locator('#confirm-dialog').waitFor({state:'hidden'});};
const person=id=>caseData.suspects.find(s=>s.id===id);
try {
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
 for(let i=0;i<3;i++){
  const context=await browser.newContext({viewport:{width:i===1?390:1440,height:900}});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('Unexpected external request');return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().endsWith('/join'))joins.push(request.postDataJSON());if(request.url().endsWith('/actions'))actions.push(request.postDataJSON()?.type);});page.setDefaultTimeout(20000);await page.goto(origin);await page.locator('#create-name').waitFor();pages.push(page);
 }
 await pages[0].fill('#create-name','Route host');await pages[0].selectOption('#case-choice',caseData.id);await pages[0].click('#create-form button');await pages[0].locator('.selectable-code').waitFor();
 const code=(await pages[0].locator('.selectable-code').textContent()).trim();
 const invite=await pages[0].inputValue('#invite-link');assert.equal(invite,`${origin}/#join=${code}`);
 await pages[0].evaluate(()=>{window.copiedInvite=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedInvite=text;}}});});
 await pages[0].click('[data-action="copy-invite"]');assert.equal(await pages[0].evaluate(()=>window.copiedInvite),invite);
 await pages[0].evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Synthetic clipboard denied');};});
 await pages[0].click('[data-action="copy-invite"]');assert.equal(await pages[0].locator('#invite-link').evaluate(el=>el===document.activeElement&&el.selectionEnd===el.value.length),true);
 for(let i=1;i<3;i++){
  const page=pages[i];if(i===1){
   const joinsBefore=joins.length;await page.goto(invite);await page.locator('#join-code').waitFor();assert.equal(await page.inputValue('#join-code'),code);assert.equal(await page.locator('#join-name').evaluate(el=>el===document.activeElement),true);
   assert.equal(await page.locator('.selectable-code').count(),0,'Opening link never joins automatically');await page.reload();await page.locator('#join-code').waitFor();assert.equal(await page.inputValue('#join-code'),code);
   assert.equal(joins.length,joinsBefore);await page.fill('#join-name',`Route agent ${i}`);await page.fill('#join-code','ZZZZZZZZ');await page.click('#join-form button');await page.locator('#notice.error').waitFor();
   assert.equal(await page.inputValue('#join-name'),`Route agent ${i}`);assert.equal(await page.inputValue('#join-code'),'ZZZZZZZZ');await page.fill('#join-code',code);
   await overflow(page);await page.screenshot({path:'/tmp/shift-recovery-invite-join-mobile.png',fullPage:true});
   assert.equal(joins.length,joinsBefore+1,'Only the explicit failed Join was sent');
  }else{await page.click('[data-entry="join"]');await page.fill('#join-name',`Route agent ${i}`);await page.fill('#join-code',code);}
  await page.click('#join-form button');await page.locator('.selectable-code').waitFor();assert.equal(new URL(page.url()).hash,'#analyse');
 }
 await overflow(pages[1]);await pages[1].screenshot({path:'/tmp/shift-recovery-invite-lobby-mobile.png',fullPage:true});
 await pages[0].screenshot({path:'/tmp/shift-recovery-invite-lobby-desktop.png',fullPage:true});
 // An invite cannot silently discard an already joined room, including after reload.
 await pages[1].goto(`${origin}/#join=ZZZZZZZZ`);await pages[1].reload();await pages[1].locator('.selectable-code').waitFor();assert.equal((await pages[1].locator('.selectable-code').textContent()).trim(),code);

 await pages[0].waitForFunction(()=>!document.querySelector('[data-action="start"]')?.disabled);await pages[0].click('[data-action="start"]');
 const route=reviewRoutes[1];assert.equal(route.interviews.length,4,'Update the authored schedule if the editorial route changes');
 const schedule=[route.interviews.slice(0,3),[route.interviews[3],{suspectId:'dev',topics:['clue']},{suspectId:'kit',topics:['clue']}],[{suspectId:'nell',topics:['clue']},{suspectId:'oscar',topics:['clue']},{suspectId:'wren',topics:['clue']}]];
 const sharedAnswers=[];
 for(let round=1;round<=3;round++){
  for(let index=0;index<3;index++){
   const page=pages[index],interview=schedule[round-1][index],suspect=person(interview.suspectId);
   await page.waitForFunction(round=>document.querySelector('.round-bar')?.textContent.includes(`Round ${round} of 3`),round);
   await navigate(page,'analyse');await page.click(`[data-action="dossier"][data-id="${suspect.id}"]`);await page.click(`[data-action="select"][data-id="${suspect.id}"]`);await confirm(page);await page.locator('#question-form').waitFor();
   for(const topic of interview.topics){
    const question=`Who had clearance at the time? Please explain your ${topic} account.`;
    await page.fill('#question',question);await page.selectOption('#question-topic',topic);
    const sent=page.waitForRequest(request=>request.url().endsWith('/actions')&&request.postDataJSON()?.type==='ask');
    await page.click('#question-form button');const payload=(await sent).postDataJSON();assert.equal(payload.question,question);assert.equal(payload.topic,topic);assert.equal(payload.aiConsent,undefined);
    const canonical=suspect.responses[topic];await page.getByText(canonical,{exact:true}).waitFor();assert.equal(await page.inputValue('#question-topic'),'');
    const answer=page.locator('.bubble.answer').filter({has:page.getByText(canonical,{exact:true})});
    if(round===1&&index===0){
     // Peers have never opened this suspect. The unshared answer must not be rendered for them.
     for(const peer of [pages[1],pages[2]]){const polled=peer.waitForResponse(response=>new URL(response.url()).pathname===`/api/rooms/${code}`&&response.request().method()==='GET'&&response.status()===200);await peer.reload();const peerState=await (await polled).json();await navigate(peer,'deduce');assert.equal(JSON.stringify(peerState).includes(canonical),false);assert.equal((await peer.locator('body').textContent()).includes(canonical),false);}
    }
    await answer.locator('[data-action="share"]').click();assert.equal(await page.locator('#confirm-body .canonical-preview').textContent(),canonical);assert.equal((await page.locator('#confirm-body').textContent()).includes(question),false);
    await confirm(page);await answer.locator('[data-action="share"][data-locked="true"]').waitFor();sharedAnswers.push(canonical);
   }
   await overflow(page);
  }
  if(round===1){
   const page=pages[1];await navigate(page,'deduce');
   await page.waitForFunction(()=>document.querySelectorAll('#source-a option[value^="clue:"]').length>=2);
   const sources=await page.locator('#source-a option[value^="clue:"]').evaluateAll(options=>options.slice(0,2).map(option=>({value:option.value,label:option.textContent})));
   const hypothesis='The authorised group and the recorded visitors should be compared.';await page.fill('#hypothesis',hypothesis);
   // Dossier sources contain the same public profile available in Analyse, not just a role.
   const dossier=caseData.suspects[0],dossierText=dossier.role+'\n\n'+dossier.profile;
   await page.selectOption('#source-a',`suspect:${dossier.id}`);
   assert.equal(await page.locator('#source-preview-a p').last().textContent(),dossierText);
   assert.equal(await page.inputValue('#hypothesis'),hypothesis);
   await page.fill('#source-search',dossier.profile);
   assert.equal(await page.locator(`#source-b option[value="suspect:${dossier.id}"]`).count(),1,'Source search matches full public profiles');
   assert.equal(await page.locator('#source-preview-a p').last().textContent(),dossierText);
   await page.fill('#source-search','');await overflow(page);
   await page.screenshot({path:'/tmp/shift-recovery-dossier-preview-mobile.png',fullPage:true});

   await page.focus('#source-a');await page.selectOption('#source-a',sources[0].value);assert.equal(await page.locator('#source-a').evaluate(el=>el===document.activeElement),true);
   await page.selectOption('#source-b',sources[1].value);await page.selectOption('#relation','supports');
   assert.equal(await page.inputValue('#hypothesis'),hypothesis);
   for(const id of ['source-preview-a','source-preview-b']){const text=await page.locator(`#${id} p`).last().textContent();assert.ok(sharedAnswers.includes(text),'Preview is exact full shared canonical answer');assert.match(await page.locator(`#${id}`).textContent(),/Shared case evidence/);}
   const originalViewport=page.viewportSize();await page.setViewportSize({width:1440,height:900});await overflow(page);await page.screenshot({path:'/tmp/shift-recovery-deduce-preview-desktop.png',fullPage:true});
   await page.setViewportSize({width:390,height:900});await overflow(page);await page.screenshot({path:'/tmp/shift-recovery-deduce-preview-mobile.png',fullPage:true});await page.setViewportSize(originalViewport);
   await page.click('#correlation-form button');
   assert.match(await page.locator('#confirm-body').textContent(),/Team hypothesis/);assert.ok((await page.locator('#confirm-body').textContent()).includes(hypothesis));await confirm(page);
   const record=page.locator('.board-record.correlation').filter({hasText:hypothesis});await record.waitFor();
   assert.match(await record.textContent(),/Unverified/);await record.locator('summary').first().click();
   const expanded=await record.locator('details').first().locator('p').textContent();assert.ok(sharedAnswers.includes(expanded),'Correlation still resolves original canonical source');await overflow(page);
   // Search only the shared board; filters must not disturb the unsent composer.
   await page.fill('#hypothesis','Keep this unsent hypothesis while reviewing records.');
   await page.selectOption('#board-filter','correlation');await page.fill('#board-search','recorded visitors');
   assert.equal(await page.locator('[aria-labelledby="team-board-heading"] .board-record').count(),1);
   assert.match(await page.locator('#board-results').textContent(),/^1 of /);
   assert.equal(await page.inputValue('#hypothesis'),'Keep this unsent hypothesis while reviewing records.');
   await page.focus('#board-search');await page.evaluate(()=>window.boardSearchBeforePoll=document.querySelector('#board-search'));
   store.rooms.get(code).version++;await page.waitForFunction(()=>!window.boardSearchBeforePoll.isConnected);
   assert.equal(await page.inputValue('#board-search'),'recorded visitors');assert.equal(await page.inputValue('#board-filter'),'correlation');
   assert.equal(await page.locator('#board-search').evaluate(el=>el===document.activeElement),true);
   await navigate(page,'analyse');await navigate(page,'deduce');assert.equal(await page.inputValue('#board-search'),'recorded visitors');
   await page.fill('#board-search','NO_MATCH_IN_THIS_PUBLIC_BOARD');assert.equal(await page.locator('[aria-labelledby="team-board-heading"] .board-record').count(),0);
   assert.match(await page.locator('[aria-labelledby="team-board-heading"]').textContent(),/No shared records match/);
   await page.click('[data-action="clear-board-search"]');assert.equal(await page.inputValue('#board-search'),'');assert.equal(await page.inputValue('#board-filter'),'all');
   assert.equal(await page.locator('#board-search').evaluate(el=>el===document.activeElement),true);
   assert.equal(await page.inputValue('#hypothesis'),'Keep this unsent hypothesis while reviewing records.');await page.fill('#hypothesis','');
   // Explicit synthetic PUBLIC-source layout fixture, not authored case evidence.
   // It enters the in-memory store and normal API/UI path, never a DOM-only fake.
   const syntheticId='synthetic-preview-layout';const syntheticText='Synthetic layout only\n'+'X'.repeat(300)+'\nA second visible line.';
   const fixtureRoom=store.rooms.get(code);fixtureRoom.board.push({id:syntheticId,type:'clue',source:'Synthetic layout fixture',text:syntheticText,by:'Layout fixture',round:1});fixtureRoom.version++;
   await page.reload();await page.locator('#source-a').waitFor();await page.selectOption('#source-a',`clue:${syntheticId}`);
   assert.equal(await page.locator('#source-preview-a p').last().textContent(),syntheticText);
   assert.equal(await page.locator('#source-preview-a p').last().evaluate(el=>getComputedStyle(el).whiteSpace),'pre-wrap');
   await page.setViewportSize({width:390,height:900});await overflow(page);
   await page.screenshot({path:'/tmp/shift-recovery-deduce-preview-synthetic-mobile.png',fullPage:true});
   // Remove only the local fixture and restore ordinary authored-route UI state.
   const restoredRoom=store.rooms.get(code);restoredRoom.board=restoredRoom.board.filter(entry=>entry.id!==syntheticId);restoredRoom.version++;
   await page.reload();await page.locator('#source-a').waitFor();await page.selectOption('#source-a',sources[0].value);await page.selectOption('#source-b',sources[1].value);await page.setViewportSize(originalViewport);

  }
  // Synthetic capacity-layout fixture after all authored-route evidence was shared.
  // This checks a long board on mobile, not player-authored note quality.
  if(round===3){const room=store.rooms.get(code);while(room.board.length<60)room.board.push({id:`layout-note-${room.board.length}`,type:'note',text:'Synthetic team note for full-board layout.',by:'Layout fixture',round:3});room.version++;}
  for(const page of pages){
   if(round===3){await page.reload();await page.locator('.stepper').waitFor();}
   await navigate(page,'deduce');
   if(round===3){
    await page.selectOption('#board-filter','note');await page.fill('#board-search','Synthetic team note');
    const expected=store.rooms.get(code).board.filter(record=>record.type==='note'&&record.text.includes('Synthetic team note')).length;
    assert.equal(await page.locator('[aria-labelledby="team-board-heading"] .board-record').count(),expected);
    assert.equal(await page.locator('#board-results').textContent(),`${expected} of 60 shared records shown. Private interviews are not searched.`);
    assert.match(await page.locator('.board-capacity').textContent(),/60 \/ 60/);
    await overflow(page);if(page===pages[1])await page.screenshot({path:'/tmp/shift-recovery-board-search-mobile.png',fullPage:true});
    await page.click('[data-action="clear-board-search"]');assert.equal(await page.locator('[aria-labelledby="team-board-heading"] .board-record').count(),60);
   }
   const progress=page.locator('.round-review');await progress.waitFor();
   assert.match(await progress.textContent(),/Sharing answers and creating correlations are optional/);
   assert.match(await progress.textContent(),/Answers still private/);
   assert.equal(await page.evaluate(()=>!!(document.querySelector('.round-review').compareDocumentPosition(document.querySelector('#correlation-form'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'Round progress precedes the optional composer');
   await overflow(page);
   await progress.locator('[data-action="end"]').click();
   await page.locator('#confirm-dialog[open]').waitFor();await confirm(page);
  }
 }
 for(const page of pages){await page.locator('.review-nav').waitFor();await navigate(page,'interrogate');await page.locator('#interview-round').waitFor();await page.selectOption('#interview-round','1');assert.equal(await page.locator('#question-form').count(),0);await overflow(page);await navigate(page,'analyse');}
 // Public dossiers remain reviewable at accusation time without changing a ballot.
 const reviewPage=pages[1],publicSuspect=caseData.suspects[0],dossierPanel=reviewPage.locator(`#vote-dossier-${publicSuspect.id}`);
 const votesBeforeReview=actions.filter(type=>type==='vote').length;
 await dossierPanel.locator('summary').focus();await reviewPage.keyboard.press('Enter');
 assert.equal(await dossierPanel.evaluate(el=>el.open),true);assert.equal(await dossierPanel.locator('p').textContent(),publicSuspect.profile);
 assert.equal(await reviewPage.locator('input[name="suspectId"]:checked').count(),0);assert.equal(await reviewPage.locator('#confirm-dialog[open]').count(),0);
 await reviewPage.evaluate(()=>window.dossierBeforePoll=document.querySelector('.vote-dossier[open]'));store.rooms.get(code).version++;
 await reviewPage.waitForFunction(()=>!window.dossierBeforePoll.isConnected);assert.equal(await dossierPanel.evaluate(el=>el.open),true);
 assert.equal(await dossierPanel.locator('summary').evaluate(el=>el===document.activeElement),true);
 await reviewPage.keyboard.press('Enter');assert.equal(await dossierPanel.evaluate(el=>el.open),false);await dossierPanel.locator('summary').click();
 assert.equal(actions.filter(type=>type==='vote').length,votesBeforeReview);await overflow(reviewPage);
 await reviewPage.screenshot({path:'/tmp/shift-recovery-accusation-dossier-mobile.png',fullPage:true});
 await reviewPage.setViewportSize({width:1440,height:900});await overflow(reviewPage);await reviewPage.screenshot({path:'/tmp/shift-recovery-accusation-dossier-desktop.png',fullPage:true});await reviewPage.setViewportSize({width:390,height:900});
 // Known-answer route outcome: not a claim that an unguided player deduced it.
 for(let i=0;i<3;i++){
  const page=pages[i];await page.check(`input[name="suspectId"][value="${caseData.culpritId}"]`);
  if(i===1){
   await navigate(page,'interrogate');await navigate(page,'analyse');assert.equal(await page.isChecked(`input[name="suspectId"][value="${caseData.culpritId}"]`),true);
   await page.locator(`#vote-dossier-${publicSuspect.id} summary`).click();assert.equal(await page.isChecked(`input[name="suspectId"][value="${caseData.culpritId}"]`),true);
   const votesBeforeCancel=actions.filter(type=>type==='vote').length;await page.click('#vote-form button');await page.locator('#confirm-dialog[open]').waitFor();await page.click('#confirm-cancel');
   assert.equal(actions.filter(type=>type==='vote').length,votesBeforeCancel);assert.equal(await page.isChecked(`input[name="suspectId"][value="${caseData.culpritId}"]`),true);
  }
  await page.click('#vote-form button');await confirm(page);
 }
 for(const page of pages){await page.locator('.reveal').waitFor();assert.match(await page.locator('.reveal').textContent(),/COMPLETE VICTORY/);assert.ok((await page.locator('.reveal').textContent()).includes(caseData.solution.motive));await overflow(page);}
 // Read-only debrief preserves the actual investigation without exposing teammates' private answers.
 const debriefPage=pages[1],debrief=debriefPage.locator('#case-debrief');
 assert.equal(await debrief.evaluate(el=>el.open),false);const actionsBeforeDebrief=actions.length;
 await debrief.locator(':scope > summary').focus();await debriefPage.keyboard.press('Enter');
 assert.equal(await debrief.evaluate(el=>el.open),true);assert.equal(await debrief.locator('.board-record').count(),60);
 assert.equal(await debrief.locator('button,form,input,textarea').count(),0);
 assert.equal(await debrief.locator('.generated-voice').count(),0);
 await debrief.locator('.debrief-interview summary').first().click();
 const ownInterview=store.rooms.get(code).players[1].interviews[0];
 for(const message of ownInterview.messages)assert.ok((await debrief.locator('.debrief-interview').first().textContent()).includes(message.answer));
 await overflow(debriefPage);await debriefPage.screenshot({path:'/tmp/shift-recovery-debrief-mobile.png',fullPage:true});
 await debriefPage.setViewportSize({width:1440,height:900});await overflow(debriefPage);await debriefPage.screenshot({path:'/tmp/shift-recovery-debrief-desktop.png',fullPage:true});
 await debrief.locator(':scope > summary').click();assert.equal(await debrief.evaluate(el=>el.open),false);
 assert.equal(actions.length,actionsBeforeDebrief,'Debrief sends no game actions');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(actions.includes('advance'),false,'Rounds advance only when all three players finish');
 console.log('PASS: authored known-route public demo; three real browser sessions; UI-only join, three rounds, scoped topics, explicit sharing, correlation, private history, votes and complete reveal. Not blind-solving evidence.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
