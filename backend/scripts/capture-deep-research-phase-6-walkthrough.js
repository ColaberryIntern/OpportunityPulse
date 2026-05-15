#!/usr/bin/env node
// Deep Research Phase 6 — executive planning walkthrough screenshot capture.

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

    console.log('1. planning workspace…');
    await page.goto(`${BASE_URL}/admin/deep-research/planning`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(OUT_DIR, 'p6-01-planning-workspace.png') });

    console.log('2. KPI strip…');
    const kpis = await page.$('[data-testid="planning-kpis"]');
    if (kpis) {
      await kpis.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await kpis.screenshot({ path: path.join(OUT_DIR, 'p6-02-kpis.png') });
    }

    console.log('3. venture health…');
    const health = await page.$('[data-testid="section-venture-health"]');
    if (health) {
      await health.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await health.screenshot({ path: path.join(OUT_DIR, 'p6-03-venture-health.png') });
    }

    console.log('4. executive interventions…');
    const interv = await page.$('[data-testid="section-interventions"]');
    if (interv) {
      await interv.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await interv.screenshot({ path: path.join(OUT_DIR, 'p6-04-interventions.png') });
    }

    console.log('5. strategic recommendations…');
    const strat = await page.$('[data-testid="section-strategic-recs"]');
    if (strat) {
      await strat.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await strat.screenshot({ path: path.join(OUT_DIR, 'p6-05-strategic-recs.png') });
    }

    console.log('6. forecast accuracy…');
    const acc = await page.$('[data-testid="section-forecast-accuracy"]');
    if (acc) {
      await acc.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await acc.screenshot({ path: path.join(OUT_DIR, 'p6-06-forecast-accuracy.png') });
    }

    console.log('7. operational drift…');
    const drift = await page.$('[data-testid="section-operational-drift"]');
    if (drift) {
      await drift.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await drift.screenshot({ path: path.join(OUT_DIR, 'p6-07-operational-drift.png') });
    }

    console.log('8. dependency review workflow…');
    const dep = await page.$('[data-testid="section-dependency-review"]');
    if (dep) {
      await dep.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await dep.screenshot({ path: path.join(OUT_DIR, 'p6-08-dependency-review.png') });
    }

    console.log('9. continuous refresh history…');
    const refresh = await page.$('[data-testid="section-refresh-history"]');
    if (refresh) {
      await refresh.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await refresh.screenshot({ path: path.join(OUT_DIR, 'p6-09-refresh-history.png') });
    }

    console.log('10. full planning page…');
    await page.screenshot({ path: path.join(OUT_DIR, 'p6-10-planning-full.png'), fullPage: true });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
