#!/usr/bin/env node
// Deep Research Phase 12 — tenant backfill + LLM provenance walkthrough.

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
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 2100 } });
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

    console.log('1. Governance Integrity full page…');
    await page.goto(`${BASE_URL}/admin/deep-research/governance-integrity`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="integrity-page"], [data-testid="integrity-loading"]', { timeout: 30000 });
    await page.waitForTimeout(7000);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p12-01-integrity-full.png'),
      fullPage: true,
    });

    const sections = [
      ['integrity-actions', '02-actions'],
      ['section-integrity', '03-integrity-composite'],
      ['section-rbac', '04-rbac-coverage'],
      ['section-provenance', '05-prompt-provenance'],
      ['section-migration', '06-asset-migration'],
      ['section-retention', '07-audit-retention'],
      ['section-sla-email', '08-sla-email'],
      ['section-sse', '09-sse-throughput'],
    ];
    for (const [testId, slug] of sections) {
      console.log(`Capturing ${slug}…`);
      const el = await page.$(`[data-testid="${testId}"]`);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await el.screenshot({ path: path.join(OUT_DIR, `p12-${slug}.png`) });
      }
    }

    // Snapshot the RBAC coverage so the next screenshot has data.
    console.log('Triggering RBAC snapshot for screenshot 10…');
    const snapshotBtns = await page.$$('button');
    for (const btn of snapshotBtns) {
      const text = await btn.innerText().catch(() => '');
      if (/Snapshot RBAC/i.test(text)) {
        await btn.click();
        await page.waitForTimeout(2500);
        break;
      }
    }

    // Capture the page again with RBAC coverage populated.
    await page.screenshot({
      path: path.join(OUT_DIR, 'p12-10-rbac-snapshot.png'),
      fullPage: true,
    });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
