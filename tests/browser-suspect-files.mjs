// Local synthetic provider only: private dossiers, continuity and safe suggestions.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchBrowser} from './helpers/browser.mjs';
import {startFakeAiServer} from './helpers/fake-ai-server.mjs';
const server = await startFakeAiServer({delay: 250});
let browser;
try {
  browser = await launchBrowser();
  for (const width of [320, 390]) {
    const context = await browser.newContext({viewport: {width, height: 600}, reducedMotion: 'reduce'});
    const page = await context.newPage(), writes = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/actions')) writes.push(r.postDataJSON()); });
    await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
    await page.goto(server.origin); await page.fill('#create-name', 'Ada'); await page.click('#create-form button');
    const code = (await page.locator('.room-code').textContent()).trim();
    for (const name of ['Bo', 'Cy']) await server.game.join(code, `${width}-${name}`, name, randomUUID());
    await page.waitForFunction(() => !document.querySelector('[data-action=start]')?.disabled);
    await page.click('[data-action=start]'); await page.click('[data-action=begin]');
    await page.click('[data-suspect=suspect-1]');
    await page.click('[data-dossier=suspect-1]');
    assert.match(await page.locator('.suspect-file').textContent(), /not questioned this suspect/);
    await page.click('[data-action=dossier-return]');
    assert.equal(await page.locator('[data-suspect=suspect-1]').getAttribute('aria-pressed'), 'true');
    await page.click('[data-action=question]');
    const ask = async (question, count) => {
      await page.fill('#question', question); await page.click('.send');
      await page.waitForFunction(n => document.querySelectorAll('#transcript .b.me').length === n && !document.querySelector('#transcript .typing'), count);
    };
    // Short-phone geometry: context access must not consume the readable transcript.
    await page.setViewportSize({width: 320, height: 380});
    const compact = await page.locator('#transcript').boundingBox();
    assert.ok(compact.height >= 90, `320x380 transcript remains readable: ${compact.height}px`);
    const fileTarget = await page.locator('#chat-suspect-file').boundingBox();
    assert.ok(fileTarget.height >= 44, 'compact file access remains a full touch target');
    assert.match(await page.locator('#chat-suspect-file').getAttribute('aria-label'), /private suspect file and earlier visits/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:`${process.env.SHIFT_SCREENSHOTS ?? '/tmp'}/shift-chat-320x380.png`});
    await page.click('#chat-suspect-file'); await page.click('[data-action=dossier-return]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'chat-suspect-file');
    await page.setViewportSize({width, height: 600});
    const asks = () => writes.filter(w => w.type === 'ask').length;
    const beforeChip = asks();
    assert.deepEqual(await page.locator('.chip').allTextContents(), [
      'Where were you during the preparations?',
      'Have you noticed anything unusual?',
      'Have you had any disagreements with Fictional character recently?',
      'Do you know Fictional character?',
    ]);
    const suggestedDraft = await page.locator('.chip').first().textContent();
    await page.locator('.chip').first().click();
    assert.equal(asks(), beforeChip); assert.equal(await page.inputValue('#question'), suggestedDraft);
    await page.reload(); await page.locator('#question').waitFor();
    assert.equal(await page.inputValue('#question'), suggestedDraft);
    assert.equal(asks(), beforeChip, 'restoring a suggestion must not send it');
    assert.ok(await page.locator('.chip').first().isDisabled());
    await page.fill('#question', 'My own question'); assert.ok(await page.locator('.chip').first().isDisabled());
    await ask('Where is the first private clue? ' + 'A long synthetic detail. '.repeat(9), 1);
    await ask('A second question. ' + 'Another synthetic detail. '.repeat(9), 2);
    await page.fill('#question', 'Keep this private unfinished question');
    await page.locator('#question').blur();
    await page.locator('#transcript').evaluate(t => {t.scrollTop = 0; t.dispatchEvent(new Event('scroll'));});
    const beforeReview = asks();
    await page.click('#chat-suspect-file');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'suspect-file-title');
    await page.locator('[data-deduction]').first().click();
    assert.match(await page.locator('.source-answer').textContent(), /first private clue/);
    await page.click('[data-action=notebook-back]'); await page.click('[data-action=dossier-return]');
    assert.equal(await page.inputValue('#question'), 'Keep this private unfinished question');
    assert.equal(await page.locator('#transcript').evaluate(t => t.scrollTop), 0);
    assert.equal(asks(), beforeReview);
    await ask('Finish this visit', 3); await page.click('[data-action=leave-chat]');
    await page.click('[data-action=advance]'); await page.click('#confirm-accept');
    await page.click('[data-action=continue]'); await page.click('[data-suspect=suspect-1]'); await page.click('[data-action=question]');
    await page.fill('#question', 'A draft on the second visit'); await page.locator('#question').blur();
    await page.click('#chat-suspect-file');
    assert.equal(await page.locator('.interview-link').count(), 2);
    await page.reload(); await page.locator('.suspect-file').waitFor();
    await page.click('[data-interview="1:suspect-1"]'); assert.match(await page.locator('.review').textContent(), /first private clue/);
    await page.click('[data-action=notebook-back]'); await page.click('[data-action=dossier-return]');
    assert.equal(await page.inputValue('#question'), 'A draft on the second visit');
    // Deterministic stage setup, not paid gameplay: preserve the selected summons across dossier reload.
    await page.evaluate(async code => { for (const round of [2, 3, 4]) await fetch(`/api/rooms/${code}/actions`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({type:'advance',round,confirmed:true,id:crypto.randomUUID()})}); }, code);
    // Explicitly move on from the held old conversation before the summons.
    await page.locator('[data-action=leave-chat]').waitFor(); await page.click('[data-action=leave-chat]');
    await page.locator('[data-action=continue]').waitFor(); await page.click('[data-action=continue]');
    await page.locator('.accuse').waitFor(); await page.click('[data-suspect=suspect-1]');
    await page.click('[data-dossier=suspect-1]'); await page.reload(); await page.locator('.suspect-file').waitFor();
    await page.click('[data-action=dossier-return]');
    assert.equal(await page.locator('[data-suspect=suspect-1]').getAttribute('aria-pressed'), 'true');
    // A newer choice or explicit deselection wins over the dossier's original return context.
    await page.click('[data-dossier=suspect-1]'); await page.click('#tabbar [data-tab=investigate]');
    await page.click('[data-suspect=suspect-2]'); await page.click('#tabbar [data-tab=deductions]');
    await page.click('[data-action=dossier-return]');
    assert.equal(await page.locator('[data-suspect=suspect-2]').getAttribute('aria-pressed'), 'true');
    await page.click('[data-dossier=suspect-2]'); await page.click('#tabbar [data-tab=investigate]');
    await page.click('[data-suspect=suspect-2]'); await page.click('#tabbar [data-tab=deductions]');
    await page.reload(); await page.locator('.suspect-file').waitFor(); await page.click('[data-action=dossier-return]');
    assert.equal(await page.locator('[data-suspect][aria-pressed=true]').count(), 0);
    await page.click('[data-suspect=suspect-1]');
    await page.click('[data-action=summon]'); await page.click('#confirm-cancel');
    assert.equal(await page.locator('[data-suspect=suspect-1]').getAttribute('aria-pressed'), 'true');
    assert.equal(writes.filter(w => w.type === 'vote').length, 0);
    await page.click('[data-dossier=suspect-1]');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:`${process.env.SHIFT_SCREENSHOTS ?? '/tmp'}/shift-suspect-file-${width}.png`});
    assert.deepEqual(errors, []); await context.close();
  }
  console.log('Private suspect files passed at 320/390px: same-suspect visits, exact sources, safe suggestions, draft/scroll/reload/summons recovery, no paid calls.');
} finally { await browser?.close(); await server.close(); }
