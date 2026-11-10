import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from '../server.mjs';
import { once } from 'node:events';
const server = createServer(); server.listen(0, '127.0.0.1'); await once(server,'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}) });
const errors=[];
try {
  const pages=[];
  for(let i=0;i<3;i++) { const context=await browser.newContext({viewport:{width:i===0?1440:390,height:i===0?1000:844}}); const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message)); await page.goto(base); pages.push(page); }
  await pages[0].screenshot({path:'/tmp/shift-welcome-desktop.png',fullPage:true});
  await pages[1].screenshot({path:'/tmp/shift-welcome-mobile.png',fullPage:true});
  await pages[0].fill('#name','Arthur'); await pages[0].click('button[value=create]'); await pages[0].waitForSelector('#room-code:not(:empty)');
  const code=await pages[0].locator('#room-code').textContent(); assert.match(code,/^[A-F0-9]{8}$/);
  for(let i=1;i<3;i++) {await pages[i].fill('#name',`Investigador ${i}`);await pages[i].fill('#code',code);await pages[i].press('#code','Enter');await pages[i].waitForSelector('#room-code:not(:empty)');assert.equal(await pages[i].locator('#room-code').textContent(),code);}
  await pages[0].waitForFunction(()=>!document.getElementById('start').disabled); await pages[0].click('#start');
  for(const p of pages) await p.waitForSelector('.suspect');
  assert.match(await pages[0].locator('#vision-description').textContent(),/Vítima:.*Local:.*Método:/);
  await pages[1].screenshot({path:'/tmp/shift-investigation-mobile.png',fullPage:true});
  for(let round=1;round<=3;round++) {
    for(const p of pages) {await p.waitForSelector('#suspect-panel:not([hidden])');await p.locator('.suspect').first().click();await p.waitForSelector('#ask-form:not([hidden])');}
    await pages[0].fill('#question','Onde você estava?');await pages[0].waitForTimeout(1700); assert.equal(await pages[0].inputValue('#question'),'Onde você estava?');
    if(round===1) {
      let dropped=false;
      await pages[0].route('**/actions',async route=>{const body=route.request().postDataJSON(); if(body.type==='ask'&&!dropped) {dropped=true;await route.fetch();await route.abort('failed');} else await route.continue();});
    }
    for(const p of pages) {await p.fill('#question','Onde você estava?');await p.click('#ask-form button');await p.waitForFunction(()=>document.querySelector('#remaining').textContent.includes('4 perguntas'));assert.equal(await p.locator('.message.user').count(),1);}
    if(round===1) {
      await pages[0].unroute('**/actions'); await pages[0].reload(); await pages[0].waitForSelector('#interview-panel:not([hidden])');assert.equal(await pages[0].locator('.message.user').count(),1);
      await pages[0].fill('#note','<img src=x onerror=alert(1)> A chave foi vista.'); await pages[0].click('#note-form button');
      await pages[1].waitForFunction(()=>document.querySelector('#notes').textContent.includes('A chave foi vista'));
      assert.equal(await pages[1].locator('#notes img').count(),0);
      await pages[1].screenshot({path:'/tmp/shift-interview-mobile.png',fullPage:true});
    }
    for(const p of pages) await p.click('#finish');
    if(round<3) for(const p of pages) {await p.waitForFunction(r=>document.querySelector('#round-label').textContent.includes(`Turno ${r}`),round+1);await p.waitForSelector('#history-panel:not([hidden])');}
  }
  for(const p of pages) await p.waitForFunction(()=>document.querySelector('#work-title').textContent.includes('assassino'));
  await pages[0].locator('.suspect').first().click();await pages[0].click('#confirm-dialog button[value=cancel]');await pages[0].waitForSelector('#suspect-panel:not([hidden])');
  for(let i=0;i<3;i++) {const p=pages[i];await p.locator('.suspect').first().click();await p.click('#confirm-yes');if(i<2) {await p.waitForSelector('#accusation-sent:not([hidden])');assert.equal(await p.locator('#result').isVisible(),false);}}
  for(const p of pages) await p.waitForSelector('#result:not([hidden])');
  assert.match(await pages[0].locator('#result').textContent(),/Responsável:/);
  await pages[0].screenshot({path:'/tmp/shift-result-desktop.png',fullPage:true});
  for(const p of pages) assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'No horizontal overflow');
  assert.deepEqual(errors,[]);
  console.log('PASS: three browser clients, mobile/desktop, room join via Enter, 3 rounds, budgets, response-loss idempotency, reload reconnect, private accusation + cancel, XSS escaping, final reveal, no overflow/page errors.');
} finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
