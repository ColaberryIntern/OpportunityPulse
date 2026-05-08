#!/usr/bin/env node
// v0.5 (Phase 4) walkthrough capture — Submission Package Assembler.

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD
  || '3yhEcVki3Vp4emDuuXWk';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'submission-readiness-v05-walkthrough-assets');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  // Tall viewport so the entire detail drawer fits in one fullPage shot.
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 2400 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));

  try {
    console.log('Logging in…');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);

    console.log('Opening Bonfire detail drawer…');
    await page.goto(`${BASE_URL}/bonfire`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const firstTitle = page.locator('table tbody tr button').first();
    if (!(await firstTitle.count())) { console.log('no bonfire row'); process.exit(0); }
    await firstTitle.click();
    await page.waitForTimeout(3500);

    // 01 — drawer with the new 📦 Submission Package banner visible
    const fp = path.join(OUT_DIR, '01-bonfire-detail-with-submission-package.png');
    await page.screenshot({ path: fp, fullPage: true });
    console.log(`  [shot] 01-bonfire-detail-with-submission-package.png — Detail drawer w/ Submission Package banner`);

    console.log('Done.');
  } catch (e) {
    console.error('Capture failed:', e.message);
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
