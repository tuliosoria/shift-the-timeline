// Local component-level browser regression. Synthetic transcripts; no paid model calls.
import assert from 'node:assert/strict';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';
const server = await startFakeAiServer(), browser = await launchBrowser();
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/__chat-reading', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><link rel="stylesheet" href="/style.css"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root" style="display:flex;flex-direction:column;height:660px;width:100%"></main><div id="announcer" class="visually-hidden" aria-live="polite"></div><script type="module">
import {mountChat} from '/chat.js';
const long = 'I read the inspection record, but did not witness the test. '.repeat(12);
window.state = {phase: 'investigation', round: 1, config: {maxQuestions: 3}, suspects: [{id:'ada',name:'Ada Finch',role:'Technician'}], me:{interviews:[{round:1,suspectId:'ada',closed:false,messages:[{id:'m1',question:'What did you see?',status:'complete',reply:long,unlocked:['a']},{id:'m2',question:'Who was there?',status:'canonical',reply:long,unlocked:[]},{id:'m3',question:'Anything else?',status:'pending'}]}]}};
window.chat = mountChat(document.getElementById('root'), {onSend: () => false});
window.refresh = () => chat.update(state, {});
refresh();
</script></body></html>`}));
  await page.goto(`${server.origin}/__chat-reading`);
  await page.locator('#question').waitFor();
  assert.equal(await page.locator('.reply-source').count(), 2);
  assert.match(await page.locator('.reply-source').first().textContent(), /AI reply · 1 new deduction/);
  assert.equal(await page.locator('.reply-source').nth(1).textContent(), 'Scripted answer');
  await page.fill('#question', 'A draft for later');
  assert.ok(await page.locator('.send').isDisabled(), 'pending reply prevents another paid submission');
  await page.locator('#question').blur();
  await page.evaluate(() => {const t = document.querySelector('#transcript'); t.scrollTop = 35; t.dispatchEvent(new Event('scroll'));});
  const before = await page.locator('#transcript').evaluate(t => t.scrollTop);
  await page.evaluate(() => {const m = state.me.interviews[0].messages[2]; Object.assign(m, {status:'complete', reply:'The record says the lamp was off.', unlocked:['b']}); refresh();});
  await page.locator('.new-reply').waitFor({state:'visible'});
  assert.ok(Math.abs(await page.locator('#transcript').evaluate(t => t.scrollTop) - before) < 2, 'arrival does not move the passage being read');
  assert.equal(await page.inputValue('#question'), 'A draft for later');
  assert.match(await page.locator('#announcer').textContent(), /AI reply · 1 new deduction/);
  await page.screenshot({path: `${process.env.SHIFT_SCREENSHOTS ?? '/tmp'}/shift-ai-reading-unread-phone.png`});
  await page.evaluate(() => refresh());
  assert.ok(await page.locator('.new-reply').isVisible(), 'ordinary polling does not discard unread reply');
  await page.click('.new-reply');
  assert.ok(await page.locator('.new-reply').isHidden());
  assert.equal(await page.evaluate(() => document.activeElement.id), 'transcript');
  assert.ok(await page.locator('#transcript').evaluate(t => t.scrollHeight - t.scrollTop - t.clientHeight < 3));

  // The final answer must remain reachable after the composer is removed.
  await page.evaluate(() => {state.me.interviews[0].messages[2].status = 'pending'; refresh(); const t = document.querySelector('#transcript'); t.scrollTop = 25; t.dispatchEvent(new Event('scroll'));});
  await page.evaluate(() => {state.me.interviews[0].messages[2].id = 'm4'; state.me.interviews[0].messages[2].status = 'canonical'; state.me.interviews[0].closed = true; refresh();});
  assert.ok(await page.locator('.new-reply').isVisible());
  assert.equal(await page.locator('#question').count(), 0);
  await page.click('.new-reply');
  assert.ok(await page.locator('.new-reply').isHidden());
  assert.ok(await page.locator('#transcript').evaluate(t => t.scrollHeight - t.scrollTop - t.clientHeight < 3));
  await page.screenshot({path: `${process.env.SHIFT_SCREENSHOTS ?? '/tmp'}/shift-ai-reading-phone.png`});
  await page.evaluate(() => {chat.destroy(); document.getElementById('root').innerHTML = '';});
  assert.deepEqual(errors, []);
  console.log('AI transcript reading and provenance browser checks passed.');
} finally {await browser.close(); await server.close();}
