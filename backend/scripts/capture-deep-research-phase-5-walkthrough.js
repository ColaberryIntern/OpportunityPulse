#!/usr/bin/env node
// Deep Research Phase 5 — observatory walkthrough screenshot capture.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'deep-research-assets');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 1700 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);

    console.log('1. observatory dashboard…');
    await page.goto(`${BASE_URL}/admin/deep-research/observatory`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p5-01-observatory-dashboard.png') });

    console.log('2. ecosystems…');
    const eco = await page.$('[data-testid="section-ecosystems"]');
    if (eco) { await eco.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
      await eco.screenshot({ path: path.join(OUT_DIR, 'p5-02-ecosystems.png') }); }

    console.log('3. drift + directional dependencies…');
    const drift = await page.$('[data-testid="section-drift"]');
    if (drift) { await drift.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
      await drift.screenshot({ path: path.join(OUT_DIR, 'p5-03-drift.png') }); }

    console.log('4. full observatory…');
    await page.screenshot({ path: path.join(OUT_DIR, 'p5-04-observatory-full.png'), fullPage: true });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
