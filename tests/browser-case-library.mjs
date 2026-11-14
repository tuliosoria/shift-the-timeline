import assert from 'node:assert/strict';
import {launchBrowser} from './helpers/browser.mjs';import {startLibraryServer} from './helpers/library-server.mjs';
import {caseLibrary} from './fixtures/case-library.mjs';import {validateCaseLibrary} from '../server/case-loader.mjs';
const server=await startLibraryServer(validateCaseLibrary(caseLibrary));let browser;const errors=[],external=[];
try{
 browser=await launchBrowser(process.env.SHIFT_CHROMIUM_PATH?{executablePath:process.env.SHIFT_CHROMIUM_PATH}:{});
 for(const c of caseLibrary.cases){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==server.origin){external.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.origin);
  assert.equal(await page.locator('#case-choice option').count(),6);await page.selectOption('#case-choice',c.id);await page.fill('#create-name','   ');
  const rejected=page.waitForResponse(r=>r.url()===server.origin+'/api/rooms'&&r.status()===400);await page.click('#create-form button');await rejected;await page.waitForFunction(()=>!document.body.classList.contains('busy'));
  assert.equal(await page.inputValue('#case-choice'),c.id,'rejected create preserves the selected case');
  await page.fill('#create-name','Host');await page.click('#create-form button');
  await page.locator('.room-code').waitFor();assert.equal(await page.locator('#header .case-title').textContent(),c.title);const code=(await page.locator('.room-code').textContent()).trim();
  for(let i=1;i<3;i++){const joinContext=await browser.newContext();const joinPage=await joinContext.newPage();await joinPage.goto(`${server.origin}/#join=${code}`);await joinPage.fill('#join-name',`Agent ${i}`);await joinPage.click('#join-form button');await joinPage.locator('.room-code').waitFor();await joinContext.close();}
  await page.click('[data-action=start]');await page.click('[data-action=begin]');await page.click('[data-suspect=suspect-0]');await page.click('[data-action=question]');
  await page.fill('#question','What did you notice?');await page.press('#question','Enter');await page.locator('#transcript .them').filter({hasText:c.suspects[0].responses.clue}).waitFor();
  await page.reload();await page.locator('#transcript .them').filter({hasText:c.suspects[0].responses.clue}).waitFor();assert.equal(await page.locator('#header .case-title').textContent(),c.title);await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Six-case browser selection, private reply and reload routing passed.');
}finally{await browser?.close();await server.close();}
