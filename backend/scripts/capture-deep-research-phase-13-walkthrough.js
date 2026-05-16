#!/usr/bin/env node
// Deep Research Phase 13 — cross-phase provenance + governance consistency walkthrough.

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
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 2200 } });
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

    console.log('1. Governance Assurance full page…');
    await page.goto(`${BASE_URL}/admin/deep-research/governance-assurance`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="assurance-page"], [data-testid="assurance-loading"]', { timeout: 30000 });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p13-01-assurance-full.png'), fullPage: true });

    const sections = [
      ['assurance-actions', '02-actions'],
      ['section-assurance', '03-assurance-composite'],
      ['section-provenance', '04-cross-provenance'],
      ['section-lineage', '05-operational-lineage'],
      ['section-permission', '06-permission-integrity'],
      ['section-consistency', '07-consistency'],
      ['section-explainability', '08-explainability'],
      ['section-drift', '09-drift'],
      ['section-stream', '10-stream-integrity'],
    ];
    for (const [testId, slug] of sections) {
      console.log(`Capturing ${slug}…`);
      const el = await page.$(`[data-testid="${testId}"]`);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await el.screenshot({ path: path.join(OUT_DIR, `p13-${slug}.png`) });
      }
    }

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
