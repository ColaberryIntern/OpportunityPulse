#!/usr/bin/env node
// Deep Research Phase 7.5 — contextual integration walkthrough capture.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const AGENCY_VALUE = process.env.PHASE7_5_AGENCY_VALUE
  || 'Dallas Area Rapid Transit (dart)';
const RUN_ID = process.env.PHASE7_5_RESEARCH_RUN_ID || '1';
const PURSUIT_ID = process.env.PHASE7_5_PURSUIT_ID || '1';
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

    console.log('1. Action Intelligence — "Open in My Opportunities" CTAs visible…');
    await page.goto(`${BASE_URL}/admin/deep-research/action-intelligence`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p75-01-action-intelligence-open-links.png'),
      fullPage: true,
    });

    console.log('2. My Opportunities entered via agency context…');
    const agencyUrl = `${BASE_URL}/admin/opportunities/my?agencyValue=${encodeURIComponent(AGENCY_VALUE)}`;
    await page.goto(agencyUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p75-02-myopps-agency-context.png'),
    });

    console.log('3. Strategic context banner (agency)…');
    const banner = await page.$('[data-testid="strategic-context-banner"]');
    if (banner) {
      await banner.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await banner.screenshot({ path: path.join(OUT_DIR, 'p75-03-strategic-banner.png') });
    }

    console.log('4. Traceability panel (expanded)…');
    const trace = await page.$('[data-testid^="trace-panel-"] button');
    if (trace) {
      await trace.scrollIntoViewIfNeeded();
      await trace.click();
      await page.waitForTimeout(900);
      const panelParent = await page.$('[data-testid^="trace-panel-"]');
      if (panelParent) {
        await panelParent.screenshot({ path: path.join(OUT_DIR, 'p75-04-traceability-panel.png') });
      }
    }

    console.log('5. My Opportunities entered via research-run context…');
    const runUrl = `${BASE_URL}/admin/opportunities/my?researchRunId=${RUN_ID}`;
    await page.goto(runUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p75-05-myopps-run-context.png'),
    });

    console.log('6. My Opportunities entered via pursuit context…');
    const pursuitUrl = `${BASE_URL}/admin/opportunities/my?pursuitId=${PURSUIT_ID}`;
    await page.goto(pursuitUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p75-06-myopps-pursuit-context.png'),
    });

    console.log('7. Default My Opportunities (no context — backward compat)…');
    await page.goto(`${BASE_URL}/admin/opportunities/my`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p75-07-myopps-no-context.png'),
    });

    console.log('8. Cluster drilldown with new "Open in My Opportunities" CTA…');
    await page.goto(`${BASE_URL}/admin/deep-research/clusters/9`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const clusterCta = await page.$('[data-testid="cluster-open-in-my-opps"]');
    if (clusterCta) {
      // crop the header so the CTA is visible
      await clusterCta.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'p75-08-cluster-open-cta.png') });

    console.log('9. Pursuit page with new "Open in My Opportunities" CTA…');
    await page.goto(`${BASE_URL}/admin/deep-research/pursuits/${PURSUIT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, 'p75-09-pursuit-open-cta.png') });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
