#!/usr/bin/env node
// Round 3 walkthrough: unified channels + cross-channel strategist +
// chart additions + score-badge fix + sort dropdown.

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

async function shot(page, file, label) {
  const fp = path.join(OUT_DIR, file);
  await page.screenshot({ path: fp, fullPage: true });
  console.log(`  [shot] ${file} (${(fs.statSync(fp).size / 1024).toFixed(1)} KB) — ${label}`);
}
async function gotoAndShot(page, url, file, label, sentinelSel = null) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (sentinelSel) await page.waitForSelector(sentinelSel, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, file, label);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
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

    // 26 OIED Mission Control with Channel Overview
    await gotoAndShot(
      page, `${BASE_URL}/admin/oied`,
      '26-mission-control-with-channels.png',
      'OIED Mission Control with Channel Overview',
    );

    // 27 Sidebar restructured (Channels group of 8)
    await page.goto(`${BASE_URL}/admin/oied`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    if (await sidebar.count()) {
      const fp = path.join(OUT_DIR, '27-sidebar-channels.png');
      await sidebar.screenshot({ path: fp });
      console.log(`  [shot] 27-sidebar-channels.png (${(fs.statSync(fp).size / 1024).toFixed(1)} KB) — sidebar Channels group`);
    }

    // 28 My Opps — Government channel filter
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/my?channel=government`,
      '28-my-opps-government.png',
      'My Opportunities filtered to Government channel (905 rows)',
      '[data-testid="my-opportunity-row"]',
    );

    // 29 My Opps — Bonfire channel filter
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/my?channel=bonfire`,
      '29-my-opps-bonfire.png',
      'My Opportunities filtered to Bonfire channel',
      '[data-testid="my-opportunity-row"]',
    );

    // 30 My Opps — Strategic Patterns channel filter
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/my?channel=strategic`,
      '30-my-opps-strategic.png',
      'Strategic Patterns channel — synthesized clusters with cross-channel context',
      '[data-testid="my-opportunity-row"]',
    );

    // 31 Sort = newest (date added)
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/my?sort=newest`,
      '31-my-opps-sort-newest.png',
      'My Opportunities sorted by Newest first (createdAt DESC)',
      '[data-testid="my-opportunity-row"]',
    );

    // 32 Sort = oldest in Government channel
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/my?channel=government&sort=oldest`,
      '32-my-opps-sort-oldest-gov.png',
      'Government channel sorted by Oldest first',
      '[data-testid="my-opportunity-row"]',
    );

    // 33 Score-priority badge close-up via the modal
    await page.goto(`${BASE_URL}/admin/opportunities/my?channel=bonfire`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="my-opportunity-row"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const titleBtn = page.locator('[data-testid="opp-row-title-btn"]').first();
    if (await titleBtn.count()) {
      await titleBtn.click({ timeout: 5000 });
      await page.waitForSelector('[data-testid="opp-detail-modal"]', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, '33-modal-with-channel-chip.png', 'Drill-down modal with channel chip in header');
      await page.locator('[data-testid="opp-detail-modal-close"]').click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // 34 Top Actions with channel chips
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/recommendations`,
      '34-top-actions-with-channel-chips.png',
      'Top Actions — channel chip on each card',
      '[data-testid="recommendation-card"]',
    );

    // 35 Legacy /dashboard with Bonfire + Strategic on the trends chart
    await gotoAndShot(
      page, `${BASE_URL}/dashboard`,
      '35-legacy-dashboard-trends-chart.png',
      'Legacy /dashboard Opportunity Trends — Bonfire + Strategic Patterns + Freelance now in legend',
    );

    console.log('\nv3 capture complete.');
  } catch (e) {
    console.error('FAIL:', e.stack || e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
