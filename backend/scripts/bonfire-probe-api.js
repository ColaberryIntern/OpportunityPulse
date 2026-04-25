#!/usr/bin/env node
// Diagnostic: dump whoami + probe likely agency endpoints on the Bonfire API host.

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

    // Step 1: read whoami via the in-page fetch (cookies & headers handled).
    await page.goto('https://vendor.bonfirehub.com/network', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const whoami = await page.evaluate(async () => {
      const r = await fetch('https://common-production-api-global.bonfirehub.com/v1.0/authn/whoami', { credentials: 'include' });
      return r.ok ? r.json() : { error: r.status };
    });
    console.log('whoami keys:', Object.keys(whoami || {}));
    console.log('whoami.user keys:', whoami.user ? Object.keys(whoami.user) : 'none');
    console.log('whoami.vendor:', JSON.stringify(whoami.vendor, null, 2).slice(0, 500));

    const vendorId = whoami.vendor && (whoami.vendor.id || whoami.vendor.vendorId);
    console.log('\nDerived vendorId:', vendorId);

    // Step 2: probe likely paths.
    const apiBase = whoami.bonfireApiUri || 'https://common-production-api-global.bonfirehub.com/v1.0';
    const candidates = [
      `${apiBase}/vendors/${vendorId}/network`,
      `${apiBase}/vendors/${vendorId}/agencies`,
      `${apiBase}/vendors/${vendorId}/connections`,
      `${apiBase}/networks`,
      `${apiBase}/agencies`,
    ].filter(Boolean);

    for (const url of candidates) {
      const result = await page.evaluate(async (u) => {
        try {
          const r = await fetch(u, { credentials: 'include' });
          if (!r.ok) return { status: r.status };
          const body = await r.json();
          return {
            status: 200,
            shape: Array.isArray(body) ? `array(len=${body.length})` : (typeof body === 'object' ? `object(keys=${Object.keys(body).slice(0,8).join(',')})` : typeof body),
            sample: Array.isArray(body) ? body[0] : (typeof body === 'object' ? body : null),
          };
        } catch (e) { return { error: e.message }; }
      }, url);
      console.log(`${result.status || result.error} ${url} -> ${result.shape || ''}`);
      if (result.status === 200 && result.sample) {
        console.log('   sample keys:', Object.keys(result.sample || {}).slice(0, 12));
      }
    }

    await page.close();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
