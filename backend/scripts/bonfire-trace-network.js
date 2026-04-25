#!/usr/bin/env node
// Diagnostic: log every JSON XHR while loading the My Network page so we can
// find the agencies endpoint.

require('dotenv').config();

(async () => {
  const { launchBrowser, createContext } = require('../src/bonfire/scraper/browser');
  const { ensureLoggedIn } = require('../src/bonfire/scraper/session');
  const { getScraperConfig } = require('../src/bonfire/scraper/config');

  const cfg = getScraperConfig();
  let browser, context;
  try {
    browser = await launchBrowser();
    context = await createContext(browser);
    await ensureLoggedIn(context);

    const page = await context.newPage();
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const ct = String(response.headers()['content-type'] || '');
        if (!ct.includes('json')) return;
        if (!url.includes('bonfirehub.com')) return;
        const body = await response.json().catch(() => null);
        const shape = Array.isArray(body)
          ? `array(len=${body.length})`
          : (body && typeof body === 'object' ? `object(keys=${Object.keys(body).slice(0,6).join(',')})` : typeof body);
        console.log(`${response.status()} ${url}  -> ${shape}`);
      } catch (e) { /* ignore */ }
    });

    await page.goto(cfg.vendorNetworkUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(15000);
    await page.close();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
