#!/usr/bin/env node
// Deep Research Phase 8 — pursuit activation + capture intelligence capture.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const PURSUIT_ID = process.env.PHASE8_PURSUIT_ID || '3';
const AGENCY_VALUE = process.env.PHASE8_AGENCY_VALUE || 'Dallas Area Rapid Transit (dart)';
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

    console.log('1. Action Intelligence with Activate-Pursuit + Graph CTAs…');
    await page.goto(`${BASE_URL}/admin/deep-research/action-intelligence`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p8-01-action-intelligence-cta.png'),
    });

    console.log('2. Trigger graph render…');
    const graphBtns = await page.$$('[data-testid^="activate-agency"]');
    if (graphBtns.length === 0) console.log('  (no agency rows visible)');
    const graphTriggers = await page.$$('button:has-text("Graph")');
    if (graphTriggers.length > 0) {
      await graphTriggers[0].click();
      await page.waitForTimeout(2500);
    }
    const graphSection = await page.$('[data-testid="section-graph"]');
    if (graphSection) {
      await graphSection.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await graphSection.screenshot({ path: path.join(OUT_DIR, 'p8-02-opportunity-graph.png') });
    }

    console.log('3. My Opportunities with Strategic Workspace Tabs…');
    const agencyUrl = `${BASE_URL}/admin/opportunities/my?agencyValue=${encodeURIComponent(AGENCY_VALUE)}`;
    await page.goto(agencyUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p8-03-workspace-tabs.png'),
    });

    console.log('4. Click "Capture Intelligence" tab…');
    const captureTab = await page.$('[data-testid="workspace-tab-capture"]');
    if (captureTab) {
      await captureTab.click();
      await page.waitForTimeout(500);
      const tabBody = await page.$('[data-testid="workspace-tab-body"]');
      if (tabBody) {
        await tabBody.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
        await tabBody.screenshot({ path: path.join(OUT_DIR, 'p8-04-capture-tab.png') });
      }
    }

    console.log('5. Click "Relationships" tab…');
    const relTab = await page.$('[data-testid="workspace-tab-relationships"]');
    if (relTab) {
      await relTab.click();
      await page.waitForTimeout(1500);
      const tabBody = await page.$('[data-testid="workspace-tab-body"]');
      if (tabBody) {
        await tabBody.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
        await tabBody.screenshot({ path: path.join(OUT_DIR, 'p8-05-relationships-tab.png') });
      }
    }

    console.log('6. Pursuit workspace full page…');
    await page.goto(`${BASE_URL}/admin/deep-research/pursuits/${PURSUIT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p8-06-pursuit-full.png'),
      fullPage: true,
    });

    console.log('7. Pursuit Readiness panel…');
    const readSection = await page.$('[data-testid="section-readiness"]');
    if (readSection) {
      await readSection.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await readSection.screenshot({ path: path.join(OUT_DIR, 'p8-07-readiness.png') });
    }

    console.log('8. Capture Strategy panel…');
    const capSection = await page.$('[data-testid="section-capture-strategy"]');
    if (capSection) {
      await capSection.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await capSection.screenshot({ path: path.join(OUT_DIR, 'p8-08-capture-strategy.png') });
    }

    console.log('9. Submission Readiness panel…');
    const subSection = await page.$('[data-testid="section-submission"]');
    if (subSection) {
      await subSection.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await subSection.screenshot({ path: path.join(OUT_DIR, 'p8-09-submission-readiness.png') });
    }

    console.log('10. Generate Drafts panel…');
    const genSection = await page.$('[data-testid="section-generate-drafts"]');
    if (genSection) {
      await genSection.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await genSection.screenshot({ path: path.join(OUT_DIR, 'p8-10-generate-drafts.png') });
    }

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
