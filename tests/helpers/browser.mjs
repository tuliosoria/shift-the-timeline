import {chromium} from 'playwright';
// CI installs Playwright's bundled Chromium; a developer machine may only have Chrome.
export async function launchBrowser(options = {}) {
  try { return await chromium.launch({headless: true, ...options}); }
  catch (error) {
    if (!/Executable doesn't exist|browserType\.launch/.test(String(error?.message))) throw error;
    return chromium.launch({headless: true, channel: 'chrome', ...options});
  }
}
