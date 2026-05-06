#!/usr/bin/env node
// v9.1 UX walkthrough capture: re-shoots all the pages that changed
// (dashboard, sidebar, action buttons, drill-down modals, rendered
// review) and saves them next to the v1 bundle.

const path = require('path');
const fs = require('fs');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
});

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47:8091';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD
  || '3yhEcVki3Vp4emDuuXWk';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'oied-walkthrough-assets');

const DIRECT_OPP_ID = Number(process.env.WALKTHROUGH_DIRECT_OPP_ID || 16645);
const PARTNER_OPP_ID = Number(process.env.WALKTHROUGH_PARTNER_OPP_ID || 13283);

async function shot(page, file, label) {
  const fp = path.join(OUT_DIR, file);
  await page.screenshot({ path: fp, fullPage: true });
  console.log(`  [shot] ${file} (${(fs.statSync(fp).size / 1024).toFixed(1)} KB) — ${label}`);
}

async function gotoAndShot(page, url, file, label, sentinelSel = null) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (sentinelSel) await page.waitForSelector(sentinelSel, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, file, label);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));

  try {
    // Login
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 15000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2000);

    // ---- 18 NEW: OIED Mission Control dashboard (the big ask) ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/oied`,
      '18-oied-dashboard.png', 'OIED Mission Control dashboard',
    );

    // ---- 19 NEW: sidebar restructure visible alongside dashboard ----
    // The dashboard view above already shows the sidebar; capture a
    // shorter snapshot for sidebar emphasis as well.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/admin/oied`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    if (await sidebar.count()) {
      const fp = path.join(OUT_DIR, '19-sidebar-restructured.png');
      await sidebar.screenshot({ path: fp });
      console.log(`  [shot] 19-sidebar-restructured.png (${(fs.statSync(fp).size / 1024).toFixed(1)} KB) — restructured sidebar`);
    }

    // ---- 20 NEW: drill-down modal on My Opportunities ----
    await page.goto(`${BASE_URL}/admin/opportunities/my`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="my-opportunity-row"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const titleBtn = page.locator('[data-testid="opp-row-title-btn"]').first();
    if (await titleBtn.count()) {
      await titleBtn.click({ timeout: 5000 });
      await page.waitForSelector('[data-testid="opp-detail-modal"]', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, '20-drill-down-modal.png', 'opportunity drill-down modal (My Opps)');
      // Close modal
      await page.locator('[data-testid="opp-detail-modal-close"]').click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // ---- 21 NEW: drill-down modal on Top Actions ----
    await page.goto(`${BASE_URL}/admin/opportunities/recommendations`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="recommendation-card"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const recTitleBtn = page.locator('[data-testid="rec-card-title-btn"]').first();
    if (await recTitleBtn.count()) {
      await recTitleBtn.click({ timeout: 5000 });
      await page.waitForSelector('[data-testid="opp-detail-modal"]', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, '21-drill-down-from-top-actions.png', 'drill-down from Top Actions');
      await page.locator('[data-testid="opp-detail-modal-close"]').click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // ---- 22 NEW: rendered Review Queue (markdown -> HTML) ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/review`,
      '22-review-rendered.png',
      'Review Queue with rendered markdown drafts',
      '[data-testid="review-card"]',
    );

    // ---- 23 NEW: lifecycle-aware action buttons (My Opps shows the
    //              "Generation locked" note on a non-act-now opp) ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/my`,
      '23-lifecycle-aware-buttons.png',
      'My Opportunities with lifecycle-aware action buttons',
      '[data-testid="my-opportunity-row"]',
    );

    // ---- 24 RE-SHOT: opp detail page for direct_submit (still useful) ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/${DIRECT_OPP_ID}`,
      '24-opp-detail-direct-v2.png',
      `single opp ${DIRECT_OPP_ID} (direct_submit, post-v9.1)`,
    );

    // ---- 25 RE-SHOT: opp detail page for partner_required ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/${PARTNER_OPP_ID}`,
      '25-opp-detail-partner-v2.png',
      `single opp ${PARTNER_OPP_ID} (partner_required, post-v9.1)`,
    );

    console.log('\nv2 capture complete.');
  } catch (e) {
    console.error('FAIL:', e.stack || e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
