// A selected dossier must lead to review, then one commit action, before the 15-card grid.
import assert from 'node:assert/strict';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';
import {TRAIN_CASE} from './fixtures/case.mjs';
const caseData = structuredClone(TRAIN_CASE);
caseData.suspects[13].name = 'AlexandraWithAnUnbrokenSyntheticFamilyName';
caseData.suspects[13].profile = 'A long synthetic public profile. '.repeat(30);
const server = await startFakeAiServer({caseData});
let browser;
const errors = [], external = [], writes = [];
const shot = process.env.SHIFT_SCREENSHOTS ?? '/tmp';
async function readyAction(page, action) {
  assert.equal(await page.evaluate(() => document.activeElement.id), 'suspect-dossier');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'selected-suspect-file');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), action, 'commit is two tabs away, not behind 15 cards');
  assert.equal(await page.locator(`[data-action=${action}]`).count(), 1);
  assert.ok(await page.locator(`#suspect-dossier [data-action=${action}]`).count());
  assert.ok(await page.evaluate(() => {
    const b = document.activeElement, box = b.getBoundingClientRect(), main = document.querySelector('#main').getBoundingClientRect();
    return box.top >= main.top - 1 && box.bottom <= main.bottom + 1 && box.left >= 0 && box.right <= innerWidth && b.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }), 'focused action fits the scrollport and is not covered by another control');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
try {
  browser = await launchBrowser(); const pages = [];
  for (const width of [320,390,390]) {
    const context = await browser.newContext({viewport:{width,height:740},reducedMotion:'reduce',hasTouch:true});
    await context.route('**/*', route => {
      if(new URL(route.request().url()).origin !== server.origin) {external.push(route.request().url());return route.abort();}return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/actions'))writes.push({page,body:r.postDataJSON()});});
    await page.goto(server.origin);pages.push(page);
  }
  const [host,reader,other]=pages;
  await host.fill('#create-name','Ada');await host.click('#create-form button');
  const code=(await host.locator('.room-code').textContent()).trim();
  for(const [i,p] of [reader,other].entries()) {await p.goto(`${server.origin}/#join=${code}`);await p.fill('#join-name',['Bo','Cy'][i]);await p.click('#join-form button');}
  await host.click('[data-action=start]');for(const p of pages)await p.click('[data-action=begin]');
  for(const [i,p]of[host,reader].entries()) {
    const width=i?390:320;
    assert.equal(await p.locator('[data-action=question]').isDisabled(),true);
    await p.locator('[data-suspect=suspect-14]').tap();await readyAction(p,'question');
    assert.equal(await p.locator('[data-action=question]').textContent(),'Question Character 14 →');
    await p.screenshot({path:`${shot}/shift-selection-after-${width}.png`});
    await p.locator('[data-suspect=suspect-14]').tap();
    assert.equal(await p.locator('#suspect-dossier').count(),0);
    assert.equal(await p.locator('[data-action=question]').isDisabled(),true);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'suspect-choice-suspect-14');
    await p.locator('[data-suspect=suspect-0]').focus();await p.keyboard.press('Enter');
    await p.keyboard.press('Tab');await p.keyboard.press('Enter');
    await p.locator('#suspect-file-title').waitFor();await p.reload();await p.locator('#suspect-file-title').waitFor();await p.click('[data-action=dossier-return]');
    await readyAction(p,'question');
    assert.equal(await p.locator('[data-suspect=suspect-0]').getAttribute('aria-pressed'),'true');
    await p.setViewportSize({width,height:380});
    await p.locator('[data-suspect=suspect-13]').tap();await readyAction(p,'question');
    await p.screenshot({path:`${shot}/shift-selection-long-${width}.png`});
    await p.keyboard.press('Tab');
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.suspect),'suspect-0','browsing continues after the only commit control');
    await p.locator('[data-suspect=suspect-14]').tap();await readyAction(p,'question');
    await p.screenshot({path:`${shot}/shift-selection-short-${width}.png`});
    await p.setViewportSize({width,height:740});
  }
  assert.equal(writes.filter(w=>['select','ask','vote'].includes(w.body.type)).length,0,'browsing and dossier review commit nothing');
  // A real other-player update must preserve the chosen action, not jump to the grid.
  await other.click('[data-suspect=suspect-2]');await other.click('[data-action=question]');
  for(const p of [host,reader]) {
    await p.waitForFunction(()=>document.querySelector('[data-suspect=suspect-2] .badge')?.textContent.includes('Cy'));
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.action),'question');
    if(p===reader) await p.locator('[data-action=question]').tap(); else await p.keyboard.press('Enter');
    await p.locator('#question').waitFor();
    const selects=writes.filter(w=>w.page===p&&w.body.type==='select');
    assert.equal(selects.length,1);assert.equal(selects[0].body.suspectId,'suspect-14');
  }
  // Synthetic local setup reaches summons without asking a model or spending questions.
  for(let round=1;round<=4;round++)await host.evaluate(async({code,round})=>{
    const response=await fetch(`/api/rooms/${code}/actions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'advance',id:crypto.randomUUID(),round,confirmed:true})});
    if(!response.ok)throw Error(`Synthetic advance failed: ${response.status}`);
  },{code,round});
  for(const [i,p]of[host,reader].entries()) {
    const width=i?390:320;
    await p.waitForFunction(()=>document.querySelector('#header .clock')?.textContent.startsWith('The summons'));
    await p.click('[data-action=leave-chat]');await p.click('[data-action=continue]');
    await p.locator('[data-suspect=suspect-14]').tap();await readyAction(p,'summon');
    await p.keyboard.press('Enter');
    assert.match(await p.locator('#confirm-title').textContent(),/Character 14/);
    assert.match(await p.locator('#confirm-body').textContent(),/This cannot be undone/);
    await p.keyboard.press('Escape');
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.action),'summon');
    assert.equal(writes.filter(w=>w.page===p&&w.body.type==='vote').length,0,'Escape never seals the summons');
    await p.locator('[data-suspect=suspect-14]').tap();assert.equal(await p.locator('[data-action=summon]').isDisabled(),true);
    await p.locator('[data-suspect=suspect-0]').tap();
    await p.keyboard.press('Tab');await p.keyboard.press('Enter');await p.reload();await p.locator('#suspect-file-title').waitFor();await p.click('[data-action=dossier-return]');
    await readyAction(p,'summon');
    await p.setViewportSize({width,height:380});
    await p.locator('[data-suspect=suspect-13]').tap();await readyAction(p,'summon');
    await p.screenshot({path:`${shot}/shift-summon-long-${width}.png`});
    await p.locator('[data-suspect=suspect-0]').tap();await readyAction(p,'summon');
    await p.screenshot({path:`${shot}/shift-summon-short-${width}.png`});
    await p.keyboard.press('Enter');await p.click('#confirm-cancel');
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.action),'summon');
    if(p===reader) await p.locator('[data-action=summon]').tap(); else await p.keyboard.press('Enter');
    await p.click('#confirm-accept');await p.locator('.sealed').waitFor();
    const votes=writes.filter(w=>w.page===p&&w.body.type==='vote');assert.equal(votes.length,1);assert.equal(votes[0].body.suspectId,'suspect-0');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Selection actions passed: 320/390px, 380px height, long profiles, two-tab commit, last-card choice/deselect, private review/return, live polls and single confirmed summons.');
}finally{await browser?.close();await server.close();}
