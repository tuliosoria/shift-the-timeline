// Real-browser check that the interrogation behaves like a phone messenger. Synthetic case, fake AI, no network.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';

const server = await startFakeAiServer();
const browser = await launchBrowser();
const shot = process.env.SHIFT_SCREENSHOTS ?? '/tmp';
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let asks = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/actions') && r.postDataJSON()?.type === 'ask') asks++; });

  // A room of three: this browser hosts, two synthetic agents join on the server.
  await page.goto(server.origin);
  await page.fill('#create-name', 'Ada');
  await page.click('#create-form button');
  const code = (await page.locator('.room-code').textContent()).trim();
  for (const name of ['Bo', 'Cy']) await server.game.join(code, `session-${name}`, name, randomUUID());
  await page.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled, null, {timeout: 6000});
  await page.click('[data-action=start]');
  await page.click('[data-action=begin]');
  await page.click('[data-suspect=suspect-1]');
  await page.click('[data-action=question]');
  await page.waitForSelector('#question');

  // A double tap on Send asks once, keeps focus in the composer and shows the typing bubble.
  await page.fill('#question', 'Where were you at eight?');
  await page.dblclick('.send');
  await page.locator('#transcript .typing').waitFor({state: 'visible', timeout: 2000});
  assert.equal(await page.inputValue('#question'), '');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'question', 'focus returns to the question');
  assert.equal(await page.locator('#transcript .typing').getAttribute('aria-label'), 'Character is replying');
  await page.locator('#transcript .b.them', {hasText: 'A synthetic reply to: Where were you at eight?'}).waitFor({state: 'visible', timeout: 6000});
  assert.equal(await page.locator('#transcript .typing').count(), 0);
  assert.equal(asks, 1, 'exactly one ask request');
  assert.equal(await page.locator('#transcript .b.me').count(), 1, 'no duplicate bubble');
  assert.equal((await page.locator('.count').textContent()).trim(), '1 of 3');
  assert.match(await page.locator('#announcer').textContent(), /A synthetic reply to: Where were you at eight\?/);

  // The unlocked deduction appears in a corner toast that leaves on its own, without taking focus.
  const toast = page.locator('#toasts .toast', {hasText: 'Deduction unlocked'});
  await toast.waitFor({state: 'visible', timeout: 6000});
  const shown = Date.now();
  assert.match(await toast.textContent(), /an alibi has a gap/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'question');
  await toast.waitFor({state: 'detached', timeout: 6000});
  assert.ok(Date.now() - shown <= 6000);

  // Enter sends; typing ahead while the reply is pending survives the polling re-renders.
  await page.fill('#question', 'What did you notice on the platform?');
  await page.press('#question', 'Enter');
  await page.locator('#transcript .typing').waitFor({state: 'visible', timeout: 2000});
  await page.keyboard.type('Who else');
  await page.locator('#transcript .b.them', {hasText: 'on the platform'}).waitFor({state: 'visible', timeout: 6000});
  await page.waitForTimeout(1200);
  assert.equal(await page.inputValue('#question'), 'Who else');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'question');
  assert.equal(await page.evaluate(() => document.getElementById('question').selectionStart), 8, 'caret survives');
  assert.equal(asks, 2);
  await page.screenshot({path: `${shot}/shift-t7-chat-844.png`});

  // A keyboard leaves 664 px: the composer and the newest bubble stay in view.
  await page.setViewportSize({width: 390, height: 664});
  await page.waitForTimeout(300);
  const composer = await page.locator('.composer').boundingBox();
  assert.ok(composer.y >= 0 && composer.y + composer.height <= 664, `composer inside the viewport: ${JSON.stringify(composer)}`);
  const transcript = await page.locator('#transcript').boundingBox(), last = await page.locator('#transcript > li').last().boundingBox();
  assert.ok(last.y >= transcript.y - 1 && last.y + last.height <= transcript.y + transcript.height + 1, 'newest bubble visible in the transcript');
  assert.ok(last.y + last.height <= composer.y, 'newest bubble above the composer');
  await page.screenshot({path: `${shot}/shift-t7-chat-keyboard-664.png`});

  // The third reply ends the turn in place; the player moves on when ready.
  await page.fill('#question', 'Who else was there?');
  await page.press('#question', 'Enter');
  await page.locator('.done', {hasText: "That's all your questions for this turn."}).waitFor({timeout: 6000});
  assert.equal(await page.locator('#question').count(), 0);
  assert.equal(await page.locator('#transcript .b.them', {hasText: 'Who else was there?'}).count(), 1, 'the last reply is readable');
  assert.equal((await page.locator('.count').textContent()).trim(), '3 of 3');
  await page.screenshot({path: `${shot}/shift-t7-chat-done.png`});
  await page.click('.done button');
  await page.getByText('Your turn is done.').waitFor();
  assert.deepEqual(errors, []);
  console.log('Browser chat checks passed.');
} finally {
  await browser.close();
  await server.close();
}
