import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {launchBrowser} from './helpers/browser.mjs';

test('CI refuses to substitute Chrome when pinned Chromium cannot launch', async () => {
  const launch = chromium.launch, ci = process.env.CI, calls = [];
  const failure = new Error('browserType.launch: missing shared library');
  try {
    process.env.CI = 'true';
    chromium.launch = async options => { calls.push(options); throw failure; };
    await assert.rejects(launchBrowser(), error => error === failure);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].channel, undefined);
  } finally {
    chromium.launch = launch;
    if (ci === undefined) delete process.env.CI; else process.env.CI = ci;
  }
});

test('local developers retain the explicit Chrome fallback', async () => {
  const launch = chromium.launch, ci = process.env.CI, calls = [], browser = {};
  try {
    delete process.env.CI;
    chromium.launch = async options => {
      calls.push(options);
      if (calls.length === 1) throw new Error("Executable doesn't exist");
      return browser;
    };
    assert.equal(await launchBrowser(), browser);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].channel, 'chrome');
  } finally {
    chromium.launch = launch;
    if (ci === undefined) delete process.env.CI; else process.env.CI = ci;
  }
});
