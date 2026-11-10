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
 // Optional external narration is explicit per question and never selected by default.
 assert.equal(await pages[1].locator('[name=aiConsent]').isChecked(),false);
 await pages[1].fill('#question','What did you notice?');
 let sent=pages[1].waitForRequest(r=>r.url().endsWith('/actions')&&r.postDataJSON()?.type==='ask');
 await pages[1].click('#question-form button');assert.equal((await sent).postDataJSON().aiConsent,undefined);
 await pages[1].waitForFunction(()=>document.querySelectorAll('.bubble.question').length===2);
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
 await act(pages[1],'vote',{suspectId:TRAIN_CASE.culpritId});await act(pages[2],'vote',{suspectId:TRAIN_CASE.culpritId});
 await pages[1].reload();await pages[1].waitForSelector('.review-nav');assert.equal(await pages[1].locator('[data-action=finalizeAccusations]').count(),0);
 now+=121000;await act(pages[1],'heartbeat');await pages[1].waitForSelector('[data-action=finalizeAccusations]');
 await pages[1].click('[data-action=finalizeAccusations]');assert.match(await pages[1].locator('#confirm-body').textContent(),/abstentions/);await pages[1].click('#confirm-accept');await pages[1].waitForSelector('.reveal');
 assert.match(await pages[1].locator('.verdicts').textContent(),/Original host.*No accusation submitted.*Abstention/);
 assert.match(await pages[1].locator('.result-stats').textContent(),/0 innocent people arrested/);
 assert.match(await pages[1].locator('.reveal').textContent(),/PARTIAL VICTORY/);
 assert.equal(await pages[1].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await pages[1].screenshot({path:'/tmp/shift-recovery-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: browser host takeover, cancel/confirm, preserved roster, missing-vote grace, explicit abstention reveal, mobile overflow, no page errors.');
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
