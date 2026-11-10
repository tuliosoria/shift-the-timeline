// Real Chromium against synthetic in-memory services and an injected fake provider.
// No credentials, private case files, AWS resources or external API calls are used.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createServer} from '../server/http.mjs';
import {createApi} from '../server/api.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {Sessions} from '../server/sessions.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {AiJobs} from '../server/ai/jobs.mjs';
import {runJob} from '../server/ai/worker.mjs';
import {TRAIN_CASE,CASES} from './fixtures/case.mjs';

async function scenario(browser,width){
 const now=Date.now(),store=new MemoryStore(),contexts=[],pageErrors=[],externalRequests=[];
 const policy={model:'synthetic-browser-model',inputRate:1,outputRate:4,inputTokens:2500,outputTokens:350};
 const jobs=new AiJobs({store,policy,now:()=>now});
 let api,providerCalls=0;
 const provider=async()=>{providerCalls++;return {text:'A synthetic fictional voice. This is not evidence.',inputTokens:10,outputTokens:5};};
 Object.defineProperty(provider,'model',{value:policy.model});
 const server=createServer({api:(...args)=>api(...args),origin:'http://127.0.0.1'});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  api=createApi({game:new DurableGame({store,ai:jobs,caseData:TRAIN_CASE,catalog:CASES,now:()=>now}),sessions:new Sessions({store,secure:false,now:()=>now}),allowedOrigin:origin,rateLimit:async()=>{}});
  const pages=[];
  for(let i=0;i<3;i++){
   const context=await browser.newContext({viewport:{width,height:844}});contexts.push(context);
   await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin===origin)return route.continue();
    externalRequests.push(route.request().url());return route.abort('blockedbyclient');
   });
   const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));
   await page.goto(origin);await page.waitForSelector('#create-name');pages.push(page);
  }
  const page=pages[0],asks=[];
  page.on('request',request=>{if(request.url().endsWith('/actions')&&request.postDataJSON()?.type==='ask')asks.push({raw:request.postData(),body:request.postDataJSON()});});
  const post=(p,path,body)=>p.evaluate(async({path,body})=>{
   const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data=await response.json();if(!response.ok)throw Error(`Synthetic API ${response.status}: ${JSON.stringify(data)}`);return data;
  },{path,body});
  await page.fill('#create-name','Synthetic host');await page.click('#create-form button');await page.waitForSelector('.selectable-code');
  const code=(await page.locator('.selectable-code').textContent()).trim();
  for(let i=1;i<3;i++)await post(pages[i],`/api/rooms/${code}/join`,{id:randomUUID(),name:`Synthetic agent ${i}`});
  const act=(type,extra={})=>post(page,`/api/rooms/${code}/actions`,{id:randomUUID(),type,...extra});
  const jobList=()=>[...store.ai.values()].filter(value=>value.kind==='job'&&value.code===code);
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`No horizontal overflow at ${width}px`);
  const select=async suspectId=>{
   await page.locator('[data-stage=analyse]').first().click();
   await page.locator(`[data-action=dossier][data-id="${suspectId}"]`).click();
   await page.locator(`[data-action=select][data-id="${suspectId}"]`).click();
   await page.click('#confirm-accept');await page.waitForSelector('#ai-consent');
  };
  const send=async question=>{
   const count=await page.locator('.bubble.question').count();
   await page.fill('#question',question);await page.locator('#question-form button').click();
   await page.waitForFunction(expected=>document.querySelectorAll('.bubble.question').length===expected,count+1);
  };
  const drain=async()=>{
   for(const job of jobList().filter(job=>job.status==='pending')){
    const result=await runJob({enabled:true,jobId:job.id,repository:jobs,provider,rates:policy,now:()=>now});
    assert.equal(result.status,'complete','The injected local provider completes a real admitted job');
   }
  };
  await page.waitForFunction(()=>document.querySelector('[data-action=start]')?.disabled===false);
  await page.click('[data-action=start]');await page.waitForSelector('[data-action=dossier]');
  await select(TRAIN_CASE.suspects[1].id);
  assert.equal(await page.isChecked('#ai-consent'),false);
  assert.equal(await page.locator('#ai-consent').getAttribute('required'),null);
  const disclosure=await page.locator('#ai-consent-help').textContent();
  for(const expected of [/OpenAI/,/fictional persona/,/relevant evidence/,/personal information/,/not evidence/i,/store:false/,/zero retention/i])assert.match(disclosure,expected);
  assert.ok((await page.locator('.ai-consent-choice').boundingBox()).height>=44,'The checkbox label is a 44px or larger target');
  await noOverflow();

  await send('Where were you at the time?');
  assert.equal(Object.hasOwn(asks.at(-1).body,'aiConsent'),false);assert.equal(jobList().length,0);assert.equal(providerCalls,0);
  // Tab reaches the native checkbox; Space toggles the actual browser control.
  await page.fill('#question','What was at stake?');await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'ai-consent');
  await page.keyboard.press('Space');assert.equal(await page.isChecked('#ai-consent'),true);
  await page.screenshot({path:`/tmp/shift-recovery-ai-consent-${width}.png`,fullPage:true});
  await send('What was at stake?');
  assert.equal(asks.at(-1).body.aiConsent,true);assert.equal(jobList().length,1);
  await drain();assert.equal(providerCalls,1);await page.waitForSelector('.generated-voice');
  assert.match(await page.locator('.generated-voice').textContent(),/NOT EVIDENCE/);
  // The provider completion arrives through real polling without losing consent.
  assert.equal(await page.isChecked('#ai-consent'),true);
  await page.locator('[data-stage=deduce]').first().click();await page.locator('[data-stage=interrogate]').first().click();
  assert.equal(await page.isChecked('#ai-consent'),true);
  await page.uncheck('#ai-consent');await send('What did you notice?');
  assert.equal(Object.hasOwn(asks.at(-1).body,'aiConsent'),false);assert.equal(jobList().length,1);assert.equal(providerCalls,1);

  await page.check('#ai-consent');await page.reload();await page.waitForSelector('#ai-consent');
  assert.equal(await page.isChecked('#ai-consent'),false,'Reload does not restore a standing AI preference');
  await page.check('#ai-consent');await act('advance',{round:1,confirmed:true});
  await page.waitForFunction(()=>document.querySelector('.round-bar')?.textContent.includes('Round 2 of 3'));
  await select(TRAIN_CASE.suspects[2].id);
  assert.equal(await page.isChecked('#ai-consent'),false,'A new round/interview starts without consent');
  await noOverflow();

  // Deliver one request to the real API, then discard only its response.
  let discard=true,discarded=0;
  await page.route('**/api/rooms/*/actions',async route=>{
   const request=route.request();
   if(discard&&request.postDataJSON()?.type==='ask'){
    discard=false;const response=await route.fetch();assert.equal(response.status(),200);
    await response.body();discarded++;await route.abort('failed');
   }else await route.continue();
  });
  await page.check('#ai-consent');await page.fill('#question','How did you know the victim?');
  const beforeRetry=asks.length;
  await page.locator('#question-form button').click();await page.waitForSelector('[data-action=retry]');
  assert.equal(discarded,1);assert.equal(jobList().length,2);
  await page.uncheck('#ai-consent');await page.click('[data-action=retry]');
  await page.waitForFunction(()=>sessionStorage.getItem('shift-pending')===null);
  const attempts=asks.slice(beforeRetry);assert.equal(attempts.length,2);
  assert.equal(attempts[0].raw,attempts[1].raw,'Retry retains the original body, ID and opt-in');
  assert.equal(attempts[0].body.aiConsent,true);assert.equal(attempts[1].body.aiConsent,true);
  assert.equal(jobList().length,2,'Retry does not create another job');
  assert.equal(await page.locator('.bubble.question').count(),1,'Retry does not create another question');
  assert.equal(await page.isChecked('#ai-consent'),false,'Unchecking still applies to future questions');
  await drain();assert.equal(providerCalls,2);await page.waitForSelector('.generated-voice');
  await noOverflow();assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);
  console.log(`PASS: ${width}px optional consent, native keyboard toggle, canonical/no-job, one fake-provider job, revoke, poll/navigation, reload/new-round reset and uncertain-response idempotent retry; no overflow or external requests.`);
 }finally{
  await Promise.allSettled(contexts.map(context=>context.close()));
  server.closeAllConnections();if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
}

const browser=await chromium.launch({headless:true});
try{for(const width of [320,390])await scenario(browser,width);}
finally{await browser.close();}
