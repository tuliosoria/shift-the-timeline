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
const pages=[],errors=[],external=[],actions=[];
const overflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal viewport overflow');
const navigate=async(page,stage)=>{await page.locator(`[data-stage="${stage}"]`).first().click();};
const confirm=async page=>{await page.locator('#confirm-dialog[open]').waitFor();await page.locator('#confirm-accept').click();await page.locator('#confirm-dialog').waitFor({state:'hidden'});};
const person=id=>caseData.suspects.find(s=>s.id===id);
try {
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
 for(let i=0;i<3;i++){
  const context=await browser.newContext({viewport:{width:i===1?390:1440,height:900}});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('Unexpected external request');return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().endsWith('/actions'))actions.push(request.postDataJSON()?.type);});page.setDefaultTimeout(20000);await page.goto(origin);await page.locator('#create-name').waitFor();pages.push(page);
 }
 await pages[0].fill('#create-name','Route host');await pages[0].selectOption('#case-choice',caseData.id);await pages[0].click('#create-form button');await pages[0].locator('.selectable-code').waitFor();
 const code=(await pages[0].locator('.selectable-code').textContent()).trim();
 for(let i=1;i<3;i++){
  await pages[i].click('[data-entry="join"]');await pages[i].fill('#join-name',`Route agent ${i}`);await pages[i].fill('#join-code',code);await pages[i].click('#join-form button');await pages[i].locator('.selectable-code').waitFor();
 }
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
   await page.selectOption('#source-a',sources[0].value);await page.selectOption('#source-b',sources[1].value);await page.selectOption('#relation','supports');
   const hypothesis='The authorised group and the recorded visitors should be compared.';await page.fill('#hypothesis',hypothesis);await page.click('#correlation-form button');
   assert.match(await page.locator('#confirm-body').textContent(),/Team hypothesis/);assert.ok((await page.locator('#confirm-body').textContent()).includes(hypothesis));await confirm(page);
   const record=page.locator('.board-record.correlation').filter({hasText:hypothesis});await record.waitFor();
   assert.match(await record.textContent(),/Unverified/);await record.locator('summary').first().click();
   const expanded=await record.locator('details').first().locator('p').textContent();assert.ok(sharedAnswers.includes(expanded),'Correlation still resolves original canonical source');await overflow(page);
  }
  for(const page of pages){await navigate(page,'deduce');await page.click('[data-action="end"]');await confirm(page);}
 }
 for(const page of pages){await page.locator('.review-nav').waitFor();await navigate(page,'interrogate');await page.locator('#interview-round').waitFor();await page.selectOption('#interview-round','1');assert.equal(await page.locator('#question-form').count(),0);await overflow(page);await navigate(page,'analyse');}
 // Known-answer route outcome: not a claim that an unguided player deduced it.
 for(let i=0;i<3;i++){
  const page=pages[i];await page.check(`input[name="suspectId"][value="${caseData.culpritId}"]`);
  if(i===1){await navigate(page,'interrogate');await navigate(page,'analyse');assert.equal(await page.isChecked(`input[name="suspectId"][value="${caseData.culpritId}"]`),true);}
  await page.click('#vote-form button');await confirm(page);
 }
 for(const page of pages){await page.locator('.reveal').waitFor();assert.match(await page.locator('.reveal').textContent(),/COMPLETE VICTORY/);assert.ok((await page.locator('.reveal').textContent()).includes(caseData.solution.motive));await overflow(page);}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(actions.includes('advance'),false,'Rounds advance only when all three players finish');
 console.log('PASS: authored known-route public demo; three real browser sessions; UI-only join, three rounds, scoped topics, explicit sharing, correlation, private history, votes and complete reveal. Not blind-solving evidence.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
