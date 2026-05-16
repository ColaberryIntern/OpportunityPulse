#!/usr/bin/env node
// Deep Research Phase 9 — submission readiness + compliance walkthrough capture.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const PURSUIT_ID = process.env.PHASE9_PURSUIT_ID || '3';
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

    console.log('1. Capture Operations dashboard…');
    await page.goto(`${BASE_URL}/admin/deep-research/capture-ops`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p9-01-capture-ops-full.png'),
      fullPage: true,
    });

    console.log('2. KPI strip close-up…');
    const kpis = await page.$('[data-testid="capture-ops-kpis"]');
    if (kpis) {
      await kpis.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await kpis.screenshot({ path: path.join(OUT_DIR, 'p9-02-capture-ops-kpis.png') });
    }

    console.log('3. Compliance gaps section…');
    const gaps = await page.$('[data-testid="section-compliance-gaps"]');
    if (gaps) {
      await gaps.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await gaps.screenshot({ path: path.join(OUT_DIR, 'p9-03-capture-ops-gaps.png') });
    }

    console.log('4. Pursuit workspace full page (with all new Phase 9 panels)…');
    await page.goto(`${BASE_URL}/admin/deep-research/pursuits/${PURSUIT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p9-04-pursuit-full.png'),
      fullPage: true,
    });

    console.log('5. Compliance Matrix panel…');
    const cm = await page.$('[data-testid="section-compliance-matrix"]');
    if (cm) {
      await cm.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await cm.screenshot({ path: path.join(OUT_DIR, 'p9-05-compliance-matrix.png') });
    }

    console.log('6. Compliance Gaps panel on pursuit page…');
    const cg = await page.$('[data-testid="section-compliance-gaps"]');
    if (cg) {
      await cg.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await cg.screenshot({ path: path.join(OUT_DIR, 'p9-06-pursuit-gaps.png') });
    }

    console.log('7. Submission Readiness composite panel…');
    const sr = await page.$('[data-testid="section-phase9-readiness"]');
    if (sr) {
      await sr.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await sr.screenshot({ path: path.join(OUT_DIR, 'p9-07-submission-readiness.png') });
    }

    console.log('8. Proposal Timeline panel…');
    const tl = await page.$('[data-testid="section-timeline"]');
    if (tl) {
      await tl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await tl.screenshot({ path: path.join(OUT_DIR, 'p9-08-timeline.png') });
    }

    console.log('9. Submission Packages panel…');
    const pkg = await page.$('[data-testid="section-packages"]');
    if (pkg) {
      await pkg.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await pkg.screenshot({ path: path.join(OUT_DIR, 'p9-09-packages.png') });
    }

    console.log('10. Parallel Draft Generation panel…');
    const pd = await page.$('[data-testid="section-parallel-drafts"]');
    if (pd) {
      await pd.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await pd.screenshot({ path: path.join(OUT_DIR, 'p9-10-parallel-drafts.png') });
    }

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
