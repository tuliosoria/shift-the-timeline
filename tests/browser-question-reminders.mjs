// Synthetic local AI only. Reviewing repeated questions must never spend a question.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';
const server = await startFakeAiServer({delay:250});
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({viewport:{width:320,height:600}, reducedMotion:'reduce'});
  await context.route('**/*', r => new URL(r.request().url()).origin === server.origin ? r.continue() : r.abort());
  const page = await context.newPage(), writes = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if(r.method()==='POST' && r.url().endsWith('/actions')) writes.push(r.postDataJSON()); });
  await page.goto(server.origin); await page.fill('#create-name','Ada'); await page.click('#create-form button');
  const code = (await page.locator('.room-code').textContent()).trim();
  for (const name of ['Bo','Cy']) await server.game.join(code,name,name,randomUUID());
  await page.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled);
  await page.click('[data-action=start]'); await page.click('[data-action=begin]');
  await page.click('[data-suspect=suspect-1]'); await page.click('[data-action=question]');
  const question = 'Where were you during the preparations?';
  await page.locator('.chip').first().click();
  assert.ok(await page.locator('.question-reminder').isHidden());
  await page.click('.send');
  await page.waitForFunction(() => document.querySelectorAll('#transcript .b.me').length === 1 && !document.querySelector('.typing'));
  await page.locator('.chip').first().click();
  await page.locator('[data-previous-question]').waitFor();
  assert.match(await page.locator('.question-reminder').textContent(), /Asked in Turn 1/);
  assert.ok(await page.locator('.send').isEnabled(), 'intentional repeat remains allowed');
  const before = writes.filter(w=>w.type!=='heartbeat').length;
  await page.locator('#question').blur();
  await page.click('[data-previous-question]');
  assert.match(await page.locator('.source-answer').textContent(), /synthetic reply/);
  assert.match(await page.evaluate(()=>document.activeElement.id), /^review-message-/);
  await page.reload(); await page.locator('.review').waitFor();
  await page.click('[data-action=dossier-return]');
  assert.equal(await page.inputValue('#question'), question);
  assert.equal(writes.filter(w=>w.type!=='heartbeat').length, before, 'review and reload are read-only');
  await page.fill('#question','A new follow-up?'); assert.ok(await page.locator('.question-reminder').isHidden());
  await page.fill('#question','  WHERE were you during the preparations?  ');
  assert.ok(await page.locator('.question-reminder').isVisible());
  await page.setViewportSize({width:320,height:380}); await page.locator('#question').blur();
  for (const locale of ['en-GB', 'pt-BR', 'en-GB']) {
    await page.selectOption('#language', locale);
    await page.waitForFunction(() => !sessionStorage.getItem('shift-pending') && !sessionStorage.getItem('shift-language-pending'));
    const shortLayout = await page.evaluate(() => Object.fromEntries(['#audio-controls','#language','#sound-toggle','#sound-settings','#transcript'].map(selector => [selector,document.querySelector(selector).getBoundingClientRect().toJSON()])));
    assert.ok(shortLayout['#transcript'].height >= 90, `${locale}: ${JSON.stringify(shortLayout)}`);
    for (const selector of ['#language','#sound-toggle','#sound-settings']) {
      assert.ok(shortLayout[selector].height >= 44, `${locale}: ${selector} retains a touch target`);
      assert.ok(shortLayout[selector].left >= 0 && shortLayout[selector].right <= 320, `${locale}: ${selector} remains visible`);
    }
    assert.equal(await page.inputValue('#question'), '  WHERE were you during the preparations?  ');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${process.env.SHIFT_SCREENSHOTS??'/tmp'}/shift-repeat-question.png`});
  await page.setViewportSize({width:320,height:600});
  const asks = writes.filter(w=>w.type==='ask').length;
  await page.click('.send');
  await page.waitForFunction(() => document.querySelectorAll('#transcript .b.me').length===2 && !document.querySelector('.typing'));
  assert.equal(writes.filter(w=>w.type==='ask').length, asks+1);
  // Revisit: the earlier answer remains accessible without consuming this turn.
  await page.evaluate(async code => { await fetch(`/api/rooms/${code}/actions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'advance',round:1,confirmed:true,id:crypto.randomUUID()})}); },code);
  await page.click('[data-action=leave-chat]'); await page.click('[data-action=continue]');
  await page.click('[data-suspect=suspect-1]'); await page.click('[data-action=question]');
  await page.fill('#question',question); await page.locator('#question').blur();
  await page.click('[data-previous-question]'); await page.click('[data-action=dossier-return]');
  assert.equal(await page.inputValue('#question'),question);
  assert.equal(await page.locator('#transcript .b.me').count(),0);
  assert.equal(writes.filter(w=>w.type==='ask').length, asks+1);
  // Move to another suspect: no advisory from the first suspect's private history.
  await page.evaluate(async code => { await fetch(`/api/rooms/${code}/actions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'advance',round:2,confirmed:true,id:crypto.randomUUID()})}); },code);
  await page.click('[data-action=leave-chat]'); await page.click('[data-action=continue]');
  await page.click('[data-suspect=suspect-2]'); await page.click('[data-action=question]');
  await page.fill('#question',question); assert.ok(await page.locator('.question-reminder').isHidden());
  assert.deepEqual(errors,[]);
  console.log('Browser question reminder checks passed.');
} finally { await browser?.close(); await server.close(); }
