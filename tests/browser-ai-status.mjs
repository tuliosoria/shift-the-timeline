// Local browser regression with manually dispatched, synthetic AI results only.
// No real provider/key/network; does not evaluate model truthfulness or blind solving.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from '../server/http.mjs';
import {createApi} from '../server/api.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {Sessions} from '../server/sessions.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {AiJobs} from '../server/ai/jobs.mjs';
import {createProvider} from '../server/ai/provider.mjs';
import {runJob} from '../server/ai/worker.mjs';
import {caseData,catalog} from '../examples/public-demo.mjs';
import {syntheticProviderResponse,publicDemoAttacks} from './helpers/public-demo-adversarial.mjs';
const data=validateCase({caseData,catalog}),store=new MemoryStore();
const policy={model:'synthetic-browser-model',inputRate:1,outputRate:4,uncapped:true,roomMicroUsd:null,dayMicroUsd:null,monthMicroUsd:null,maxConcurrent:2};
const jobs=new AiJobs({store,policy}),admission={prepareQuestion:args=>args.aiConsent===true?jobs.prepareQuestion(args):Promise.resolve([])};
let api,browser,calls=0;const server=createServer({api:(...args)=>api(...args),origin:'http://127.0.0.1'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
api=createApi({game:new DurableGame({store,...data,ai:admission}),sessions:new Sessions({store,secure:false}),allowedOrigin:origin,dialogueMode:'optional-openai',rateLimit:async()=>{}});
const pages=[],errors=[],external=[];const confirm=async p=>{await p.locator('#confirm-dialog[open]').waitFor();await p.click('#confirm-accept');await p.locator('#confirm-dialog').waitFor({state:'hidden'});};
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
 for(let i=0;i<3;i++){
  const context=await browser.newContext({viewport:{width:i===0?390:1440,height:900}});await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('external request');return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);await page.goto(origin);await page.locator('#create-name').waitFor();pages.push(page);
 }
 const page=pages[0];await page.fill('#create-name','AI host');await page.selectOption('#case-choice',caseData.id);await page.click('#create-form button');await page.locator('.selectable-code').waitFor();const code=(await page.locator('.selectable-code').textContent()).trim();
 for(let i=1;i<3;i++){await pages[i].click('[data-entry="join"]');await pages[i].fill('#join-name',`Peer ${i}`);await pages[i].fill('#join-code',code);await pages[i].click('#join-form button');await pages[i].locator('.selectable-code').waitFor();}
 await page.waitForFunction(()=>!document.querySelector('[data-action="start"]')?.disabled);await page.click('[data-action="start"]');
 const suspect=caseData.suspects[0];await page.click(`[data-action="dossier"][data-id="${suspect.id}"]`);await page.click(`[data-action="select"][data-id="${suspect.id}"]`);await confirm(page);await page.locator('#question-form').waitFor();
 assert.equal(await page.locator('[name="aiConsent"]').isChecked(),false);assert.ok(!(await page.locator('#question-form').textContent()).includes('everything local'));
 const ask=async(topic,consent)=>{await page.fill('#question',`A synthetic ${topic} question`);await page.selectOption('#question-topic',topic);await page.locator('[name="aiConsent"]').setChecked(consent);const sent=page.waitForRequest(r=>r.url().endsWith('/actions')&&r.postDataJSON()?.type==='ask');await page.click('#question-form button');const body=(await sent).postDataJSON();assert.equal(body.aiConsent,consent?true:undefined);await page.getByText(suspect.responses[topic],{exact:true}).waitFor();return page.locator('.bubble.answer').filter({has:page.getByText(suspect.responses[topic],{exact:true})});};
 const plain=await ask('clue',false);assert.equal(await plain.locator('.generated-voice').count(),0);assert.equal(store.ai.size,0);
 const pending=await ask('alibi',true);await pending.getByRole('status').waitFor();assert.match(await pending.getByRole('status').textContent(),/PREPARING/);assert.equal(await pending.locator('[data-action="share"]').isEnabled(),true);assert.equal(await page.locator('#question-form button').isEnabled(),true);
 let job=[...store.ai.values()].find(x=>x.kind==='job'&&x.status==='pending');assert.ok(job);
 const sample=publicDemoAttacks('fictional culprit')[4];const provider=createProvider({model:policy.model,getSecret:async()=>'synthetic-only',fetchImpl:async()=>{calls++;return syntheticProviderResponse(sample);}});
 await runJob({enabled:true,jobId:job.id,repository:jobs,provider});await pending.getByRole('note',{name:'Unverified AI voice'}).waitFor();assert.ok((await pending.textContent()).includes(sample.voice));assert.equal(await pending.locator('img,script').count(),0);assert.equal(await page.evaluate(()=>window.mockInjected),undefined);
 await pending.locator('[data-action="share"]').click();assert.equal(await page.locator('#confirm-body .canonical-preview').textContent(),suspect.responses.alibi);assert.ok(!(await page.locator('#confirm-body').textContent()).includes(sample.voice));await confirm(page);
 for(const peer of pages.slice(1)){await peer.reload();await peer.locator('.round-bar').waitFor();await peer.locator('[data-stage="deduce"]').first().click();await peer.getByText(suspect.responses.alibi,{exact:true}).waitFor();assert.ok(!(await peer.locator('body').textContent()).includes(sample.voice));}
 const fallback=await ask('motive',true);await fallback.getByRole('status').waitFor();job=[...store.ai.values()].find(x=>x.kind==='job'&&x.status==='pending');assert.ok(job);
 const failed=createProvider({model:policy.model,getSecret:async()=>'synthetic-only',fetchImpl:async()=>{calls++;return new Response('synthetic outage',{status:503});}});await runJob({enabled:true,jobId:job.id,repository:jobs,provider:failed});
 await fallback.getByText('OPTIONAL AI VOICE · UNAVAILABLE',{exact:true}).waitFor();assert.match(await fallback.getByRole('status').textContent(),/will not be retried automatically/);assert.ok((await fallback.textContent()).includes(suspect.responses.motive));assert.equal(await page.locator('.question-count').innerText().then(t=>t.startsWith('3')),true);
 await runJob({enabled:true,jobId:job.id,repository:jobs,provider:failed});assert.equal(calls,2);await page.reload();await page.locator('.round-bar').waitFor();await page.locator('[data-stage="interrogate"]').first().click();await page.getByText('OPTIONAL AI VOICE · UNAVAILABLE',{exact:true}).waitFor();assert.equal(calls,2);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: three local browser sessions; no-consent/no-job, pending→synthetic complete/fallback, usable evidence, private escaped voice, canonical-only sharing, stable fallback after reload. No real AI/model-quality claim.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
