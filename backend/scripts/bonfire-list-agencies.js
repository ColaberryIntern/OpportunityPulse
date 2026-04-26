#!/usr/bin/env node
// Hit the agencies API directly to dump all subdomains + shape.

require('dotenv').config();

(async () => {
  const { launchBrowser, createContext } = require('../src/bonfire/scraper/browser');
  const { ensureLoggedIn } = require('../src/bonfire/scraper/session');

  let browser, context;
  try {
    browser = await launchBrowser();
    context = await createContext(browser);
    await ensureLoggedIn(context);
    const page = await context.newPage();
    await page.goto('https://vendor.bonfirehub.com/agencies', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const all = await page.evaluate(async () => {
      const regions = ['us', 'ca', 'eu'];
      const out = [];
      for (const region of regions) {
        const r = await fetch(
          `https://common-production-api-global.bonfirehub.com/v1.0/vendors/me/agencies?region=${region}`,
          { credentials: 'include' }
        );
        if (r.ok) {
          const arr = await r.json();
          for (const a of arr) out.push({ region, ...a });
        }
      }
      return out;
    });

    console.log('Total:', all.length);
    console.log('Sample shape (first record):');
    console.log(JSON.stringify(all[0], null, 2));
    console.log('\nAll subdomains (sorted):');
    const subs = all.map((a) => {
      // Try to find a subdomain hint
      const candidates = [a.subdomain, a.shortName, a.handle, a.slug, a.code, a.portalSubdomain];
      return candidates.find((c) => c) || null;
    }).filter(Boolean).sort();
    console.log(subs.join(','));
    console.log('\nFields present:', [...new Set(all.flatMap((a) => Object.keys(a)))].sort());

    await page.close();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
