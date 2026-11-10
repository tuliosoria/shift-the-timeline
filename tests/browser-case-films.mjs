// Real media playback on the public demo; no external services or paid AI.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from '../server/http.mjs';
import {createApi} from '../server/api.mjs';
import {DurableGame} from '../server/persistent-game.mjs';
import {Sessions} from '../server/sessions.mjs';
import {MemoryStore} from '../server/storage/memory.mjs';
import {validateCase} from '../server/case-loader.mjs';
import {caseData,catalog} from '../examples/public-demo.mjs';
const store=new MemoryStore();let api,browser;
const server=createServer({origin:'http://127.0.0.1',api:(...args)=>api(...args)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
api=createApi({game:new DurableGame({store,...validateCase({caseData,catalog})}),sessions:new Sessions({store,secure:false}),allowedOrigin:origin,rateLimit:async()=>{}});
const errors=[];
const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
 const contexts=[];
 for(const width of [390,1440,320]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});contexts.push(context);
  const page=await context.newPage(),requests=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().endsWith('.mp4'))requests.push(r.url());});
  await page.goto(origin);await page.locator('#create-name').waitFor();
  await page.waitForTimeout(300);assert.equal(requests.length,0,'Static first paint never fetches films');
  await page.fill('#create-name','Film agent');await noOverflow(page);
  await page.getByRole('button',{name:'Play The night train'}).click();
  await page.waitForFunction(()=>document.querySelector('#case-film-video')?.currentTime>0);
  assert.equal(requests.length>0,true);
  assert.equal(await page.locator('#case-film-video').evaluate(v=>v.muted&&v.playsInline&&v.controls&&!v.autoplay&&!v.loop),true);
  assert.equal(await page.locator('#film-dialog').getAttribute('aria-describedby'),'film-description');
  await page.getByRole('button',{name:'The pocket watch',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#case-film-video').currentSrc.endsWith('/pocket-watch.mp4')&&document.querySelector('#case-film-video').currentTime>0);
  await page.getByRole('button',{name:'The empty corridor',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#case-film-video').currentSrc.endsWith('/corridor.mp4')&&document.querySelector('#case-film-video').currentTime>0);
  await noOverflow(page);
  if(width===390)await page.screenshot({path:'/tmp/shift-recovery-films-mobile-viewer.png',fullPage:true});
  await page.keyboard.press('Escape');await page.locator('#film-dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('#case-film-video').getAttribute('src'),null);
  assert.equal(await page.locator('#create-name').inputValue(),'Film agent','Films preserve entry drafts');
  assert.equal(await page.locator('#case-film-open').evaluate(el=>el===document.activeElement),true);
  for(let i=0;i<2;i++){await page.locator('#case-film-open').click();await page.locator('#film-close').click();}
  assert.equal(await page.locator('#case-film-video').getAttribute('src'),null);
  if(width===390){
   await page.screenshot({path:'/tmp/shift-recovery-films-mobile-landing.png',fullPage:true});
   await page.click('#create-form button');await page.locator('.selectable-code').waitFor();
   const code=(await page.locator('.selectable-code').textContent()).trim();
   await page.getByRole('button',{name:'Play The empty corridor'}).click();
   const video=await page.locator('#case-film-video').elementHandle();
   const others=[];
   for(let i=0;i<2;i++){
    const c=await browser.newContext(),p=await c.newPage();others.push(p);
    await p.goto(origin);await p.click('[data-entry="join"]');await p.fill('#join-name',`Other ${i}`);await p.fill('#join-code',code);await p.click('#join-form button');await p.locator('.selectable-code').waitFor();
   }
   await page.waitForFunction(()=>document.querySelectorAll('.roster li').length===3);
   assert.equal(await video.evaluate(el=>el===document.querySelector('#case-film-video')),true,'Polling leaves the playing element intact');
   assert.equal(await page.locator('#film-dialog').evaluate(d=>d.open),true);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#case-film-open').evaluate(el=>el===document.activeElement),true,'Focus returns after background re-render');
   await page.click('[data-action="start"]');await page.locator('#stage-heading').waitFor();
   await page.getByRole('button',{name:'Play The pocket watch'}).click();await page.locator('#film-close').click();
   await page.screenshot({path:'/tmp/shift-recovery-films-mobile-investigation.png',fullPage:true});
  }
  await context.close();
 }
 const failureContext=await browser.newContext(),failure=await failureContext.newPage();
 await failure.route('**/*.mp4',route=>route.abort());await failure.goto(origin);await failure.locator('#case-film-open').click();
 await failure.getByText('The film could not be loaded. You can close this viewer and keep investigating.').waitFor();
 await failure.locator('#film-close').click();await failure.locator('#create-name').fill('Still playable');
 assert.deepEqual(errors,[]);console.log('Case films: mobile/desktop, manual muted playback, all scenes, repeated close, polling, focus, drafts and media failure passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
