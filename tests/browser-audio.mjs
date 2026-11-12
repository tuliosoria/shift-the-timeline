// Synthetic gameplay; audio is observed at the native media/graph boundary, never an API.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';
const server = await startFakeAiServer({delay: 350});
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({viewport: {width: 320, height: 740}, reducedMotion: 'reduce'});
  const page = await context.newPage(), errors = [], assets = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('/assets/audio/')) assets.push(r.url()); });
  await page.addInitScript(() => {
    window.audioEvents = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) { if (this instanceof HTMLAudioElement) { window.testMusic = this; window.audioEvents.push(['music', this.src]); } return play.apply(this, args); };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { window.audioEvents.push(['effect']); return start.apply(this, args); };
  });
  await page.goto(server.origin);
  assert.equal(await page.locator('#sound-toggle').textContent(), 'Enable sound');
  assert.equal(assets.length, 0, 'no audio bytes before opt-in');
  await page.click('#sound-toggle');
  await page.waitForFunction(() => window.testMusic && !window.testMusic.paused && window.testMusic.readyState >= 2);
  await page.waitForFunction(() => window.testMusic.duration > 100);
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  // Deliberately finish tracks; both real MP3s load and the playlist returns to its start.
  await page.evaluate(() => { window.testMusic.currentTime = window.testMusic.duration - .05; });
  await page.waitForFunction(() => window.testMusic.src.endsWith('/investigation.mp3') && !window.testMusic.paused && window.testMusic.readyState >= 2);
  await page.evaluate(() => { window.testMusic.currentTime = window.testMusic.duration - .05; });
  await page.waitForFunction(() => window.testMusic.src.endsWith('/investigation-noir.mp3') && !window.testMusic.paused);
  // Keyboard-friendly settings, narrow layout, remembered levels.
  await page.click('#sound-settings'); await page.locator('#music-volume').fill('0'); await page.locator('#effects-volume').fill('45');
  assert.equal(await page.locator('#music-level').textContent(), '0%');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.activeElement.id), 'sound-settings');
  // A real send/receive pair fires once; a poll and notebook remount do not repeat either.
  await page.fill('#create-name', 'Ada'); await page.click('#create-form button');
  const code = (await page.locator('.room-code').textContent()).trim();
  for (const name of ['Bo', 'Cy']) await server.game.join(code, `audio-${name}`, name, randomUUID());
  await page.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled);
  await page.click('[data-action=start]'); await page.click('[data-action=begin]');
  await page.click('[data-suspect=suspect-1]'); await page.click('[data-action=question]');
  await page.waitForSelector('#question');
  await page.evaluate(() => { window.audioEvents.length = 0; });
  await page.fill('#question', 'Where is the key?'); await page.press('#question', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#transcript .b.me').length === 1 && !document.querySelector('#transcript .typing'));
  assert.equal(await page.evaluate(() => audioEvents.filter(e => e[0] === 'effect').length), 2, 'send and reply, no polling duplicates');
  await page.waitForTimeout(1700);
  assert.equal(await page.evaluate(() => audioEvents.filter(e => e[0] === 'effect').length), 2);
  await page.locator('#question').blur(); await page.click('[data-tab=deductions]'); await page.click('[data-tab=investigate]');
  assert.equal(await page.evaluate(() => audioEvents.filter(e => e[0] === 'effect').length), 4, 'only two navigation clicks, no old replies');
  await page.click('#sound-toggle'); assert.equal(await page.evaluate(() => testMusic.paused), true);
  const before = await page.evaluate(() => audioEvents.length);
  await page.click('[data-tab=deductions]'); assert.equal(await page.evaluate(() => audioEvents.length), before);
  await page.reload(); await page.waitForSelector('#sound-toggle');
  assert.equal(await page.locator('#sound-toggle').textContent(), 'Enable sound');
  await page.click('#sound-settings'); assert.equal(await page.inputValue('#music-volume'), '0'); assert.equal(await page.inputValue('#effects-volume'), '45');
  await page.screenshot({path: '/tmp/shift-audio-settings-320.png'});
  assert.deepEqual(errors, []);
  console.log('Browser audio passed: opt-in, both tracks, controls, persistence, send/receive once and mute.');
} finally { await browser?.close(); await server.close(); }
