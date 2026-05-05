#!/usr/bin/env node
// One-off: focused viewport screenshot of /admin/triggers (top of page).

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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 700 } });
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

    await page.goto(`${BASE_URL}/admin/triggers`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="trigger-logs-page"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Just the viewport (header + first ~12 log rows).
    const out = path.join(OUT_DIR, 'trigger_logs_viewport.png');
    await page.screenshot({ path: out });
    console.log('saved:', out);

    // Also: a focused shot of just the auto_execution_logs table area
    // for the v6 report.
    const tableLocator = page.locator('[data-testid="trigger-logs-table"]').first();
    if (await tableLocator.count() > 0) {
      const out2 = path.join(OUT_DIR, 'auto_execution_logs.png');
      await tableLocator.screenshot({ path: out2 });
      console.log('saved:', out2);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
