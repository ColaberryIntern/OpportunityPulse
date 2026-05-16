#!/usr/bin/env node
// Deep Research Phase 11 — multi-tenant governance + auditability walkthrough.

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
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 2000 } });
  const page = await ctx.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console:error]', msg.text()); });
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(3000);

    console.log('1. Governance dashboard full page…');
    await page.goto(`${BASE_URL}/admin/deep-research/governance`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="governance-page"], [data-testid="governance-loading"]', { timeout: 30000 });
    await page.waitForTimeout(6000);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p11-01-governance-full.png'),
      fullPage: true,
    });

    const sections = [
      ['section-pressure', '02-tenant-pressure'],
      ['section-sla', '03-sla-escalations'],
      ['section-workloads', '04-operator-workloads'],
      ['section-bottlenecks', '05-workflow-bottlenecks'],
      ['section-approval-aging', '06-approval-aging'],
      ['section-audit', '07-audit-trail'],
      ['section-storage', '08-storage-backend'],
      ['section-streams', '09-observability-streams'],
      ['section-governance-events', '10-governance-events'],
    ];
    for (const [testId, slug] of sections) {
      console.log(`Capturing ${slug}…`);
      const el = await page.$(`[data-testid="${testId}"]`);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await el.screenshot({ path: path.join(OUT_DIR, `p11-${slug}.png`) });
      }
    }

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
