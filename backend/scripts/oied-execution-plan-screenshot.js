#!/usr/bin/env node
// One-off: focused screenshot of bundle #43 with strategy + blueprint
// + execution plan all three rendered.

const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47:8091';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD;
const OUT_DIR = path.resolve(__dirname, '..', '.oied-screenshots');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 15000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(1500);

    await page.goto(`${BASE_URL}/admin/opportunities/bundles`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="bundles-list"]', { timeout: 15000 });
    await page.waitForTimeout(2500);

    const target = page.locator(
      '[data-testid="bundle-card"]:has([data-testid="bundle-execution-plan"])'
    ).first();
    const count = await page.locator(
      '[data-testid="bundle-card"]:has([data-testid="bundle-execution-plan"])'
    ).count();
    console.log(`bundles with execution plan: ${count}`);
    if (count > 0) {
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      const out = path.join(OUT_DIR, 'bundle_execution_plan.png');
      await target.screenshot({ path: out });
      console.log('saved:', out);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
