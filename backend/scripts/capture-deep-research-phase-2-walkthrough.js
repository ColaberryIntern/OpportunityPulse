#!/usr/bin/env node
// Deep Research Intelligence Engine — Phase 2 walkthrough screenshot capture.
//
// Captures, into docs/deep-research-assets/:
//   p2-01-reports-index.png      — the reports index / intelligence terminal
//   p2-02-report-correlation.png — report page: cross-channel correlation section
//   p2-03-venture-scores.png     — a venture idea card with 8-dimension scoring
//   p2-04-report-full.png        — the full upgraded report page
//   p2-05-briefing-center.png    — the daily executive briefing center
//
// Uses the seeded Phase 2 sample report.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'deep-research-assets');
const SAMPLE_TERM = 'AI agents for government operations [sample]';

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 1700 } });

  const loginRes = await ctx.request.post(`${BASE_URL}/api/v1/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = (await loginRes.json())?.data?.accessToken;
  if (!token) { console.error('Login failed'); process.exit(1); }

  // Resolve the seeded report id.
  let reportId = null;
  for (let i = 1; i <= 30 && !reportId; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await ctx.request.get(`${BASE_URL}/api/v1/deep-research/${i}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok()) {
      // eslint-disable-next-line no-await-in-loop
      const body = await r.json();
      if (body?.data?.searchTerm === SAMPLE_TERM) reportId = i;
    }
  }
  if (!reportId) { console.error('Sample report not found — run the seeder first.'); process.exit(1); }
  console.log('Sample report id:', reportId);

  const page = await ctx.newPage();
  try {
    console.log('Login UI…');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);

    // p2-01 — reports index
    console.log('1. reports index…');
    await page.goto(`${BASE_URL}/admin/deep-research`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p2-01-reports-index.png') });

    // p2-02 — report page, correlation section
    console.log('2. report correlation section…');
    await page.goto(`${BASE_URL}/admin/deep-research/${reportId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const corr = await page.$('[data-testid="section-correlation"]');
    if (corr) {
      await corr.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await corr.screenshot({ path: path.join(OUT_DIR, 'p2-02-report-correlation.png') });
    }

    // p2-03 — venture idea card with scores
    console.log('3. venture scores…');
    const ventureSection = await page.$('[data-testid="section-venture-ideas"]');
    if (ventureSection) {
      await ventureSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await ventureSection.screenshot({ path: path.join(OUT_DIR, 'p2-03-venture-scores.png') });
    }

    // p2-04 — full report page
    console.log('4. full report…');
    await page.screenshot({ path: path.join(OUT_DIR, 'p2-04-report-full.png'), fullPage: true });

    // p2-05 — briefing center
    console.log('5. briefing center…');
    await page.goto(`${BASE_URL}/admin/deep-research/briefings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, 'p2-05-briefing-center.png') });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
