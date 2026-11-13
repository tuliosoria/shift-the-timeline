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
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  // Normal browsers may wait for a gesture, without changing the ON preference.
  await page.click('h1');
  await page.waitForFunction(() => window.testMusic && !window.testMusic.paused && window.testMusic.readyState >= 2);
  await page.waitForFunction(() => window.testMusic.duration > 100);
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  // Deliberately finish tracks; both real MP3s load and the playlist returns to its start.
  await page.evaluate(() => { window.testMusic.currentTime = window.testMusic.duration - .05; });
  await page.waitForFunction(() => window.testMusic.src.endsWith('/investigation.mp3') && !window.testMusic.paused && window.testMusic.readyState >= 2);
  await page.evaluate(() => { window.testMusic.currentTime = window.testMusic.duration - .05; });
  await page.waitForFunction(() => window.testMusic.src.endsWith('/investigation-noir.mp3') && !window.testMusic.paused && window.testMusic.readyState >= 3 && document.querySelector('#sound-toggle').classList.contains('is-playing'));
  assert.equal(await page.locator('#sound-toggle').evaluate(e => e.classList.contains('is-playing')), true);
  assert.equal(await page.locator('.sound-disc').evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.reload();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  await page.click('h1');
  await page.waitForFunction(() => window.testMusic && !window.testMusic.paused);
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
  assert.equal(await page.locator('#sound-toggle .sound-label').textContent(), 'Enable sound');
  await page.click('#sound-settings'); assert.equal(await page.inputValue('#music-volume'), '0'); assert.equal(await page.inputValue('#effects-volume'), '45');
  await page.screenshot({path: '/tmp/shift-audio-settings-320.png'});
  assert.deepEqual(errors, []);
  // Deterministic browser-policy rejection: preference must survive, not turn OFF.
  const blockedContext = await browser.newContext({viewport: {width: 390, height: 800}});
  const blocked = await blockedContext.newPage();
  blocked.on('pageerror', e => errors.push(e.message));
  await blocked.addInitScript(() => {
    window.gestureSeen = false; window.blockedAttempts = 0;
    document.addEventListener('pointerdown', e => { if (e.isTrusted) window.gestureSeen = true; }, true);
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (!(this instanceof HTMLAudioElement)) return original.apply(this, args);
      window.blockedMusic = this;
      if (!window.gestureSeen) { window.blockedAttempts++; return Promise.reject(new DOMException('Gesture required', 'NotAllowedError')); }
      return original.apply(this, args);
    };
  });
  await blocked.goto(server.origin);
  await blocked.waitForFunction(() => window.blockedAttempts > 0 && document.querySelector('#sound-toggle').classList.contains('is-waiting'));
  assert.equal(await blocked.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await blocked.locator('.sound-disc').evaluate(e => getComputedStyle(e).animationPlayState), 'paused');
  await blocked.click('h1');
  await blocked.waitForFunction(() => !window.blockedMusic.paused && document.querySelector('#sound-toggle').classList.contains('is-playing'));
  assert.equal(await blocked.locator('.sound-disc').evaluate(e => getComputedStyle(e).animationPlayState), 'running');
  await blocked.reload();
  await blocked.waitForFunction(() => window.blockedAttempts > 0 && document.querySelector('#sound-toggle').classList.contains('is-waiting'));
  assert.equal(await blocked.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  // Explicit mute is reachable even while the browser is waiting.
  await blocked.click('#sound-toggle');
  assert.equal(await blocked.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  await blocked.reload(); await blocked.waitForSelector('#sound-toggle');
  assert.equal(await blocked.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await blocked.evaluate(() => window.blockedAttempts), 0);
  await blockedContext.close();
  assert.deepEqual(errors, []);
  // Use actual browser activation, not a test flag set on pointerdown: touch and
  // pen grant activation on release, whereas mouse grants it on press.
  for (const input of ['touch', 'pen', 'mouse', 'keyboard']) {
    const activationContext = await browser.newContext({hasTouch: true, isMobile: true, viewport: {width: 390, height: 800}});
    const activationPage = await activationContext.newPage();
    await activationPage.addInitScript(() => {
      window.activationEvents = []; window.activationAttempts = [];
      for (const name of ['pointerdown', 'pointerup', 'keydown']) document.addEventListener(name, e => {
        window.activationEvents.push({type: e.type, pointer: e.pointerType, trusted: e.isTrusted, active: navigator.userActivation.isActive});
      }, true);
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (!(this instanceof HTMLAudioElement)) return original.apply(this, args);
        window.activationMusic = this;
        window.activationAttempts.push(navigator.userActivation.isActive);
        if (!navigator.userActivation.isActive) return Promise.reject(new DOMException('Activation required', 'NotAllowedError'));
        return original.apply(this, args);
      };
    });
    const activationCdp = await activationContext.newCDPSession(activationPage);
    const readWithoutGesture = async expression => (await activationCdp.send('Runtime.evaluate', {expression, returnByValue: true, userGesture: false})).result.value;
    await activationPage.goto(server.origin);
    for (let tries = 0; tries < 80 && !await readWithoutGesture("document.querySelector('#sound-toggle')?.classList.contains('is-waiting')"); tries++) await new Promise(r => setTimeout(r, 100));
    assert.equal(await readWithoutGesture('navigator.userActivation.hasBeenActive'), false);
    const box = await readWithoutGesture("JSON.parse(JSON.stringify(document.querySelector('h1').getBoundingClientRect()))"), x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (input === 'touch') await activationPage.touchscreen.tap(x, y);
    else if (input === 'mouse') await activationPage.mouse.click(x, y);
    else if (input === 'keyboard') await activationPage.keyboard.press('a');
    else {
      const cdp = await activationContext.newCDPSession(activationPage);
      await cdp.send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1, pointerType: 'pen'});
      await cdp.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', clickCount: 1, pointerType: 'pen'});
      await cdp.detach();
    }
    for (let tries = 0; tries < 80 && !await readWithoutGesture("document.querySelector('#sound-toggle').classList.contains('is-playing')"); tries++) await new Promise(r => setTimeout(r, 100));
    assert.equal(await readWithoutGesture("document.querySelector('#sound-toggle').classList.contains('is-playing')"), true, `${input}: first interaction unlocks audio`);
    const observed = await readWithoutGesture('({events: activationEvents, attempts: activationAttempts})');
    assert.deepEqual(observed.attempts, [false, true], `${input}: one blocked autoplay and one activated retry`);
    if (input === 'touch') {
      assert.equal(observed.events.find(e => e.type === 'pointerdown').active, false);
      assert.equal(observed.events.find(e => e.type === 'pointerup').active, true);
    }
    assert.equal(await activationPage.evaluate(() => !activationMusic.paused), true, `${input} starts audio after one interaction`);
    await activationPage.locator('#sound-toggle').tap();
    await activationPage.reload();
    assert.equal(await activationPage.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await activationPage.evaluate(() => activationAttempts), [], `${input}: mute survives F5`);
    await activationContext.close();
  }
  console.log('Browser audio passed: default on, reload preference, both tracks, controls, persistence, send/receive once and mute.');
} finally { await browser?.close(); await server.close(); }
