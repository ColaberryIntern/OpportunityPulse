#!/usr/bin/env node
// Test: navigate to a Bonfire opportunity detail by CLICKING through the list
// page. Preserves session/referer/cookies — sometimes bypasses Cloudflare when
// a direct goto() does not.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

(async () => {
  const { launchBrowser, createContext, jitter } = require('../src/bonfire/scraper/browser');
  const { ensureLoggedIn, openAgencyPortal } = require('../src/bonfire/scraper/session');
  const { getScraperConfig } = require('../src/bonfire/scraper/config');
  const { isChallengePage } = require('../src/bonfire/scraper/cloudflare');

  const cfg = getScraperConfig();
  const outDir = path.join(cfg.storageDir, 'capture');
  fs.mkdirSync(outDir, { recursive: true });

  let browser, context;
  try {
    browser = await launchBrowser();
    context = await createContext(browser);
    await ensureLoggedIn(context);

    const portal = await openAgencyPortal(context, 'dhantx');
    if (portal.blocked) {
      console.log('Portal-open blocked:', portal.reason);
      return;
    }
    const page = portal.page;
    await page.waitForTimeout(5000);

    // Click the first /opportunities/* link in the page.
    const link = await page.$('a[href*="/opportunities/"]');
    if (!link) { console.log('no opportunity link found'); return; }
    const href = await link.getAttribute('href');
    console.log('Clicking link:', href);

    // Some Bonfire row links open new tabs (target=_blank). Use page.evaluate to
    // force same-tab navigation by removing target.
    await link.evaluate((el) => el.removeAttribute('target'));

    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      link.click(),
    ]);
    await page.waitForTimeout(8000);

    const url = page.url();
    const blocked = await isChallengePage(page);
    console.log('Landed:', url, 'blocked?', blocked);
    const html = await page.content();
    const file = path.join(outDir, 'detail-via-click.html');
    fs.writeFileSync(file, html);
    console.log(`Saved (${html.length} chars) -> ${file}`);
    await page.close();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
