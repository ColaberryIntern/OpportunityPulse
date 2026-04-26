#!/usr/bin/env node
// One-off: log in, navigate to a single Bonfire opportunity detail page,
// dump the HTML for selector inspection.
//
// Usage:
//   node scripts/bonfire-capture-detail.js https://dhantx.bonfirehub.com/opportunities/229849

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/bonfire-capture-detail.js <full opportunity URL>');
  process.exit(2);
}

(async () => {
  const { launchBrowser, createContext } = require('../src/bonfire/scraper/browser');
  const { ensureLoggedIn } = require('../src/bonfire/scraper/session');
  const { getScraperConfig } = require('../src/bonfire/scraper/config');

  const cfg = getScraperConfig();
  const outDir = path.join(cfg.storageDir, 'capture');
  fs.mkdirSync(outDir, { recursive: true });

  let browser, context;
  try {
    browser = await launchBrowser();
    context = await createContext(browser);
    await ensureLoggedIn(context);

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
      await page.waitForTimeout(8000);

      const html = await page.content();
      const safeName = url.replace(/[^a-z0-9-]+/gi, '-').slice(0, 80);
      const file = path.join(outDir, `detail-${safeName}.html`);
      fs.writeFileSync(file, html);
      console.log(`Saved (${html.length} chars) -> ${file}`);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
