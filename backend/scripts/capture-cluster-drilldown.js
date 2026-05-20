#!/usr/bin/env node
// Strategic cluster drilldown — capture screenshots of (a) the cluster drawer
// with the new "View matching Bonfire bids" button and (b) the /bonfire page
// after the user clicks through.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'deep-research-assets');
// Cluster id from the smoke test — 82 source bids, "Integrated AI Management
// System for Public Sector Operations".
const CLUSTER_ID = process.env.CLUSTER_ID || 'cd3cc913-f281-4b90-94cb-2c55416af6cf';

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 2200 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin|\/bonfire/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);

    console.log('1. Strategic Opportunities page (top of grid)…');
    await page.goto(`${BASE_URL}/bonfire/strategic`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(OUT_DIR, 'cluster-01-strategic-grid.png'), fullPage: false });

    console.log('2. Click into the target cluster card → drawer with new CTA…');
    // Navigate by id via the in-app fetch path the page uses (simpler than DOM hunting).
    await page.evaluate(async (clusterId) => {
      // The strategic detail drawer is keyed off route state — easiest reliable
      // path is to wire it from the URL hash; the page already supports
      // clicking a card to open. We'll find a card whose data-testid contains
      // the id, fall back to the first card.
      const cards = Array.from(document.querySelectorAll('button'));
      const target = cards.find((b) => b.innerText && /cluster \(8[0-9] bids\)/i.test(b.innerText));
      if (target) target.click();
    }, CLUSTER_ID);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, 'cluster-02-drawer-with-cta.png'), fullPage: false });

    console.log('3. /bonfire with fromCluster filter (deep-link entry)…');
    await page.goto(`${BASE_URL}/bonfire?fromCluster=${encodeURIComponent(CLUSTER_ID)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT_DIR, 'cluster-03-filtered-bonfire-page.png'), fullPage: false });

    console.log('Done.');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
