#!/usr/bin/env node
// Aggressive discovery: clear the session cache, log in fresh, navigate to
// /network, log EVERY XHR (not just JSON ones), then dump the page HTML and
// also pull localStorage / sessionStorage. Goal: find where the 82 agency
// subdomains live so we can populate BONFIRE_SCRAPER_AGENCY_ALLOWLIST.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

(async () => {
  const { launchBrowser, createContext, clearStorageState } = require('../src/bonfire/scraper/browser');
  const { ensureLoggedIn } = require('../src/bonfire/scraper/session');
  const { getScraperConfig } = require('../src/bonfire/scraper/config');

  const cfg = getScraperConfig();
  const outDir = path.join(cfg.storageDir, 'capture');
  fs.mkdirSync(outDir, { recursive: true });

  // Force a fresh login so any cached XHR responses get replayed.
  clearStorageState();

  let browser, context;
  try {
    browser = await launchBrowser();
    context = await createContext(browser, { useStoredSession: false });
    await ensureLoggedIn(context);

    const page = await context.newPage();
    const xhrs = [];
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (!url.includes('bonfirehub.com')) return;
        const ct = String(response.headers()['content-type'] || '');
        const status = response.status();
        let bodyShape = '-';
        if (ct.includes('json') && status < 300) {
          const body = await response.json().catch(() => null);
          if (Array.isArray(body)) {
            bodyShape = `array(len=${body.length})`;
          } else if (body && typeof body === 'object') {
            bodyShape = `object(keys=${Object.keys(body).slice(0, 8).join(',')})`;
          }
        }
        xhrs.push({ url, status, ct: ct.split(';')[0], shape: bodyShape });
      } catch { /* ignore */ }
    });

    console.log('navigating to /network ...');
    await page.goto(cfg.vendorNetworkUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
    await page.waitForTimeout(15000);

    // Try clicking any tabs / filters that might trigger more loads.
    // (best-effort; ignore if these don't exist)
    const clickTargets = [
      'a[href*="network"]',
      'button:has-text("Refresh")',
      'button:has-text("All")',
    ];
    for (const sel of clickTargets) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click({ timeout: 2000 }); await page.waitForTimeout(2000); }
      } catch { /* ignore */ }
    }

    console.log('\n=== ALL bonfirehub.com responses captured ===');
    xhrs.forEach((r) => console.log(`${r.status} ${r.ct.padEnd(20)} ${r.shape.padEnd(40)} ${r.url}`));

    const storage = await page.evaluate(() => {
      const dump = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const v = localStorage.getItem(k);
          dump['local:' + k] = v && v.length > 200 ? v.slice(0, 200) + `... [${v.length} chars]` : v;
        }
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          const v = sessionStorage.getItem(k);
          dump['session:' + k] = v && v.length > 200 ? v.slice(0, 200) + `... [${v.length} chars]` : v;
        }
      } catch (e) { dump._error = e.message; }
      return dump;
    });
    console.log('\n=== localStorage / sessionStorage keys ===');
    for (const [k, v] of Object.entries(storage)) console.log(`${k}\n  -> ${v}`);

    const html = await page.content();
    fs.writeFileSync(path.join(outDir, 'network-fresh.html'), html);

    // Probe the rendered page for any links that look like agency portals.
    const links = await page.$$eval('a', (as) =>
      as.map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 60) }))
    );
    const agencyLinks = links.filter(
      (l) =>
        /\b[a-z0-9-]+\.bonfirehub\.com\b/i.test(l.href)
        && !/\b(vendor|account|www)\./i.test(l.href)
    );
    const subdomains = [...new Set(agencyLinks.map((l) => l.href.match(/\/\/([a-z0-9-]+)\.bonfirehub/i)[1].toLowerCase()))];
    console.log(`\n=== Agency-link subdomains found in DOM (${subdomains.length}): ===`);
    subdomains.forEach((s) => console.log(' ', s));

    await page.close();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
