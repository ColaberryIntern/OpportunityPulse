#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'submission-readiness-v07-walkthrough-assets');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 1800 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));
  try {
    console.log('Login…');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);

    console.log('Loading Bonfire to grab a real opp id…');
    await page.goto(`${BASE_URL}/bonfire`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const oppId = await page.evaluate(() => {
      const btns = document.querySelectorAll('table tbody tr button');
      // Bonfire opp ids are UUIDs — table rows don't expose the id directly,
      // so grab the first row + click + read the data from the drawer.
      return btns.length ? 'first-row' : null;
    });
    if (!oppId) { console.log('no rows'); process.exit(0); }
    // Easier: click into row + capture detail drawer "Open full readiness page" link target.
    const firstTitle = page.locator('table tbody tr button').first();
    await firstTitle.click();
    await page.waitForTimeout(3000);
    const href = await page.locator('a:has-text("Open full readiness page")').first().getAttribute('href').catch(() => null);
    if (!href) { console.log('no readiness link'); process.exit(0); }
    console.log('Readiness link:', href);

    await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-dedicated-readiness-page.png'), fullPage: true });
    console.log(`  [shot] 01-dedicated-readiness-page.png`);

    console.log('Done.');
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
