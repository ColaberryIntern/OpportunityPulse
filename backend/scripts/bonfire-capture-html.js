#!/usr/bin/env node
// One-off: log in, capture HTML from key pages, dump to ./.bonfire-session/ for
// selector inspection. Pure read-only — never writes to DB.

require('dotenv').config();

const fs = require('fs');
const path = require('path');

(async () => {
  const { launchBrowser, createContext } = require('../src/bonfire/scraper/browser');
  const { ensureLoggedIn, openAgencyPortal } = require('../src/bonfire/scraper/session');
  const { getScraperConfig } = require('../src/bonfire/scraper/config');

  const cfg = getScraperConfig();
  const outDir = path.join(cfg.storageDir, 'capture');
  fs.mkdirSync(outDir, { recursive: true });

  let browser, context;
  try {
    browser = await launchBrowser();
    context = await createContext(browser);
    await ensureLoggedIn(context);

    const captures = [
      { name: 'vendor-dashboard', url: cfg.vendorHubUrl, wait: 5000 },
      { name: 'vendor-network', url: cfg.vendorNetworkUrl, wait: 5000 },
    ];
    for (const c of captures) {
      const page = await context.newPage();
      try {
        await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
        await page.waitForTimeout(c.wait);
        const html = await page.content();
        const file = path.join(outDir, `${c.name}.html`);
        fs.writeFileSync(file, html);
        console.log(`Captured ${c.name} (${html.length} chars) -> ${file}`);
      } finally {
        await page.close().catch(() => {});
      }
    }

    // Try a DHA portal capture too — uses the per-portal redirect path.
    const dha = await openAgencyPortal(context, 'dhantx');
    if (dha.blocked) {
      console.log(`DHA portal blocked: ${dha.reason}`);
    } else {
      await dha.page.waitForTimeout(5000);
      const html = await dha.page.content();
      const file = path.join(outDir, 'dha-portal.html');
      fs.writeFileSync(file, html);
      console.log(`Captured dha-portal (${html.length} chars) -> ${file}`);
    }
    if (dha && dha.page) await dha.page.close().catch(() => {});

    console.log('\nDone. Inspect HTML in', outDir);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
