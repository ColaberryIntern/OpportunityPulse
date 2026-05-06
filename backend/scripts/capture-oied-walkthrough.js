#!/usr/bin/env node
// Captures the screenshot bundle for docs/oied-feature-walkthrough.html.
//
// Reuses the login + viewport pattern from oied-strategy-screenshot.js.
// Run: node backend/scripts/capture-oied-walkthrough.js
//
// Env knobs (defaults are fine for prod):
//   OIED_TEST_BASE_URL          (default http://95.216.199.47:8091)
//   OIED_TEST_ADMIN_EMAIL       (default admin@opportunitypulse.com)
//   OIED_TEST_ADMIN_PASSWORD    (required if not in .env)
//   WALKTHROUGH_DIRECT_OPP_ID   (default 16645)
//   WALKTHROUGH_PARTNER_OPP_ID  (default 13283)
//   WALKTHROUGH_GROUNDING_OPP_ID (default 11048)

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
const GROUNDING_OPP_ID = Number(process.env.WALKTHROUGH_GROUNDING_OPP_ID || 11048);

async function fullPageShot(page, outFile, label) {
  const fp = path.join(OUT_DIR, outFile);
  await page.screenshot({ path: fp, fullPage: true });
  const size = fs.statSync(fp).size;
  console.log(`  [shot] ${outFile} (${(size / 1024).toFixed(1)} KB) — ${label}`);
}

async function gotoAndShot(page, url, outFile, label, sentinelSel = null) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (sentinelSel) {
    await page.waitForSelector(sentinelSel, { timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);
  await fullPageShot(page, outFile, label);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));

  try {
    // ---- 01 login (capture before submitting) ----
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 15000 });
    await page.waitForTimeout(800);
    await fullPageShot(page, '01-login.png', 'login form');

    // ---- log in ----
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2000);

    // ---- 02 dashboard (post-login landing) ----
    await gotoAndShot(page, `${BASE_URL}/dashboard`, '02-dashboard.png', 'dashboard / nav');

    // ---- 03 top actions / recommendations ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/recommendations`,
      '03-top-actions.png', 'top actions',
    );

    // ---- 04 my opportunities ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/my`,
      '04-my-opportunities.png', 'my opportunities',
    );

    // ---- 05 execution queue ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/execution`,
      '05-execution-queue.png', 'execution queue',
    );

    // ---- 06 review queue ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/review`,
      '06-review-queue.png', 'review queue',
    );

    // ---- 07 revenue dashboard ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/revenue`,
      '07-revenue-dashboard.png', 'revenue dashboard',
    );

    // ---- 08 daily briefing ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/briefing`,
      '08-briefing.png', 'daily briefing',
    );

    // ---- 09 trigger logs ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/triggers`,
      '09-trigger-logs.png', 'trigger logs',
    );

    // ---- 10 profile editor ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/profile`,
      '10-profile.png', 'business / org profile editor',
    );

    // ---- 11 bundles list ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/bundles`,
      '11-bundles-list.png', 'bundles list',
      '[data-testid="bundles-list"]',
    );

    // ---- 12/13/14 bundle disclosures ----
    // The strategy/blueprint/execution-plan are disclosures inside bundle
    // cards. Find a card with each disclosure populated and screenshot it.
    for (const [testid, outName, label] of [
      ['bundle-strategy', '12-bundle-strategy.png', 'bundle strategy expanded'],
      ['bundle-blueprint', '13-bundle-blueprint.png', 'bundle blueprint expanded'],
      ['bundle-execution-plan', '14-bundle-execution-plan.png', 'bundle execution plan expanded'],
    ]) {
      const sel = `[data-testid="bundle-card"]:has([data-testid="${testid}"])`;
      const count = await page.locator(sel).count().catch(() => 0);
      if (count > 0) {
        const target = page.locator(sel).first();
        await target.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        // Try to expand the disclosure if collapsed.
        const detailsBtn = target.locator(`[data-testid="${testid}"]`).first();
        try {
          await detailsBtn.click({ timeout: 3000 });
          await page.waitForTimeout(600);
        } catch (e) { /* may already be expanded */ }
        const out = path.join(OUT_DIR, outName);
        await target.screenshot({ path: out });
        const size = fs.statSync(out).size;
        console.log(`  [shot] ${outName} (${(size / 1024).toFixed(1)} KB) — ${label}`);
      } else {
        // Fall back to the bundles-list shot itself so the HTML still resolves.
        const fp = path.join(OUT_DIR, outName);
        fs.copyFileSync(path.join(OUT_DIR, '11-bundles-list.png'), fp);
        console.log(`  [shot] ${outName} (fallback to bundles-list — no card with ${testid})`);
      }
    }

    // ---- 15 single opp: direct_submit example ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/${DIRECT_OPP_ID}`,
      '15-opp-detail-direct-submit.png',
      `single opp ${DIRECT_OPP_ID} (direct_submit example)`,
    );

    // ---- 16 single opp: partner_required example ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/${PARTNER_OPP_ID}`,
      '16-opp-detail-partner-required.png',
      `single opp ${PARTNER_OPP_ID} (partner_required example)`,
    );

    // ---- 17 single opp: grounding + lifecycle precedence ----
    await gotoAndShot(
      page, `${BASE_URL}/admin/opportunities/${GROUNDING_OPP_ID}`,
      '17-opp-detail-grounding.png',
      `single opp ${GROUNDING_OPP_ID} (grounding + lifecycle precedence)`,
    );

    console.log('\nCapture complete:');
    const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png')).sort();
    for (const f of files) {
      const sz = fs.statSync(path.join(OUT_DIR, f)).size;
      console.log(`  ${f}  ${(sz / 1024).toFixed(1)} KB`);
    }
    console.log(`\nTotal PNGs: ${files.length}`);
  } catch (e) {
    console.error('FAIL:', e.stack || e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
