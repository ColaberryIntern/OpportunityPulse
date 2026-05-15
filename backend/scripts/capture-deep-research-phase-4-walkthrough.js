#!/usr/bin/env node
// Deep Research Intelligence Engine — Phase 4 walkthrough screenshot capture.
//
// Captures, into docs/deep-research-assets/:
//   p4-01-portfolio-dashboard.png — the portfolio intelligence dashboard
//   p4-02-capacity-pressure.png   — capacity + bottlenecks section
//   p4-03-roi-scenarios.png       — ROI scenarios section
//   p4-04-portfolio-full.png      — the full portfolio page

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
    console.log('Login UI…');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);

    // p4-01 — portfolio dashboard
    console.log('1. portfolio dashboard…');
    await page.goto(`${BASE_URL}/admin/deep-research/portfolio`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p4-01-portfolio-dashboard.png') });

    // p4-02 — capacity pressure section
    console.log('2. capacity pressure…');
    const cap = await page.$('[data-testid="section-capacity"]');
    if (cap) {
      await cap.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await cap.screenshot({ path: path.join(OUT_DIR, 'p4-02-capacity-pressure.png') });
    }

    // p4-03 — ROI scenarios section
    console.log('3. ROI scenarios…');
    const roi = await page.$('[data-testid="section-roi"]');
    if (roi) {
      await roi.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await roi.screenshot({ path: path.join(OUT_DIR, 'p4-03-roi-scenarios.png') });
    }

    // p4-04 — full portfolio page
    console.log('4. full portfolio…');
    await page.screenshot({ path: path.join(OUT_DIR, 'p4-04-portfolio-full.png'), fullPage: true });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
