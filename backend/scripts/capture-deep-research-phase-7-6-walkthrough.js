#!/usr/bin/env node
// Deep Research Phase 7.6 — competing-tools walkthrough capture.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const REPORT_ID = process.env.PHASE7_6_REPORT_ID || '4';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'deep-research-assets');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 1800 } });
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

    console.log('1. Deep Research report — full page (with Competitive Landscape section)…');
    await page.goto(`${BASE_URL}/admin/deep-research/${REPORT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p76-01-report-full.png'),
      fullPage: true,
    });

    console.log('2. Competitive Landscape section close-up…');
    const ctSection = await page.$('[data-testid="section-competing-tools"]');
    if (ctSection) {
      await ctSection.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await ctSection.screenshot({ path: path.join(OUT_DIR, 'p76-02-competitive-landscape.png') });
    }

    console.log('3. Build Recommendation context (now grounded against the tools)…');
    const buildRec = await page.$('[data-testid="section-build-recommendation"]');
    if (buildRec) {
      await buildRec.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await buildRec.screenshot({ path: path.join(OUT_DIR, 'p76-03-build-recommendation.png') });
    }

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
