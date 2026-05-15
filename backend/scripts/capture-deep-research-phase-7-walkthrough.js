#!/usr/bin/env node
// Deep Research Phase 7 — action intelligence walkthrough screenshot capture.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const SEED_CLUSTER_ID = process.env.PHASE7_SEED_CLUSTER_ID || '9';
const SEED_PURSUIT_ID = process.env.PHASE7_SEED_PURSUIT_ID || '1';
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

    console.log('1. action intelligence dashboard…');
    await page.goto(`${BASE_URL}/admin/deep-research/action-intelligence`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(OUT_DIR, 'p7-01-action-intelligence.png') });

    console.log('2. KPIs strip…');
    const kpis = await page.$('[data-testid="ai-kpis"]');
    if (kpis) {
      await kpis.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await kpis.screenshot({ path: path.join(OUT_DIR, 'p7-02-kpis.png') });
    }

    console.log('3. top actionable clusters…');
    const clusters = await page.$('[data-testid="section-clusters"]');
    if (clusters) {
      await clusters.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await clusters.screenshot({ path: path.join(OUT_DIR, 'p7-03-top-clusters.png') });
    }

    console.log('4. proposal acceleration candidates…');
    const accel = await page.$('[data-testid="section-acceleration"]');
    if (accel) {
      await accel.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await accel.screenshot({ path: path.join(OUT_DIR, 'p7-04-acceleration.png') });
    }

    console.log('5. recurring agencies…');
    const agencies = await page.$('[data-testid="section-agencies"]');
    if (agencies) {
      await agencies.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await agencies.screenshot({ path: path.join(OUT_DIR, 'p7-05-recurring-agencies.png') });
    }

    console.log('6. cluster drilldown…');
    await page.goto(`${BASE_URL}/admin/deep-research/clusters/${SEED_CLUSTER_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, 'p7-06-cluster-drilldown.png') });

    console.log('7. cluster opportunities table…');
    const oppsTable = await page.$('[data-testid="section-opportunities"]');
    if (oppsTable) {
      await oppsTable.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await oppsTable.screenshot({ path: path.join(OUT_DIR, 'p7-07-cluster-opportunities.png') });
    }

    console.log('8. justification card…');
    const just = await page.$('[data-testid="section-justification"]');
    if (just) {
      await just.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await just.screenshot({ path: path.join(OUT_DIR, 'p7-08-justification.png') });
    }

    console.log('9. research runs…');
    await page.goto(`${BASE_URL}/admin/deep-research/research-runs`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, 'p7-09-research-runs.png') });

    console.log('10. pursuit workspace…');
    await page.goto(`${BASE_URL}/admin/deep-research/pursuits/${SEED_PURSUIT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, 'p7-10-pursuit-workspace.png'), fullPage: true });

    console.log('11. full action intelligence page (long)…');
    await page.goto(`${BASE_URL}/admin/deep-research/action-intelligence`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, 'p7-11-action-intelligence-full.png'), fullPage: true });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
