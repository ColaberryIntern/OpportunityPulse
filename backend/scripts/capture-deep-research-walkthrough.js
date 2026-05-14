#!/usr/bin/env node
// Deep Research Intelligence Engine — Phase 1 walkthrough screenshot capture.
//
// Captures, into docs/deep-research-assets/:
//   01-deep-research-button.png   — the Deep Research button on My Opportunities
//   02-report-overview.png        — report page: exec summary + market timing + signals
//   03-venture-ideas.png          — the venture ideas section with Generate Requirements
//   04-report-full.png            — the full executive report page
//   05-requirements-modal.png     — the requirements-generation progress modal (completed)
//
// Uses the seeded sample report (search term: "AI agents for government
// operations [sample]"). Run `node scripts/seed-deep-research-sample.js`
// first if it isn't present.

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

  // Resolve the seeded report id via the API.
  const loginRes = await ctx.request.post(`${BASE_URL}/api/v1/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const loginBody = await loginRes.json();
  const token = loginBody?.data?.accessToken || loginBody?.data?.token || loginBody?.token;
  if (!token) { console.error('Login failed'); process.exit(1); }

  // The seeder always uses report id from a known term — just try id 1..20
  // and find the sample. (Phase 1 has no list endpoint yet.)
  let reportId = null;
  for (let i = 1; i <= 20 && !reportId; i += 1) {
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
  if (!reportId) {
    console.error('Sample report not found — run seed-deep-research-sample.js first.');
    process.exit(1);
  }
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

    // 01 — Deep Research button on My Opportunities (search active so it's enabled).
    console.log('1. deep research button…');
    await page.goto(`${BASE_URL}/admin/opportunities/my?q=AI`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-deep-research-button.png') });

    // 02 — report page overview (top of the executive dashboard).
    console.log('2. report overview…');
    await page.goto(`${BASE_URL}/admin/deep-research/${reportId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, '02-report-overview.png') });

    // 03 — venture ideas section.
    console.log('3. venture ideas…');
    const ventureSection = await page.$('[data-testid="section-venture-ideas"]');
    if (ventureSection) {
      await ventureSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await ventureSection.screenshot({ path: path.join(OUT_DIR, '03-venture-ideas.png') });
    }

    // 04 — full report page.
    console.log('4. full report…');
    await page.screenshot({ path: path.join(OUT_DIR, '04-report-full.png'), fullPage: true });

    // 05 — requirements generation modal (click Generate Requirements, let it finish).
    console.log('5. requirements modal…');
    const genBtn = await page.$('[data-testid^="generate-requirements-"]');
    if (genBtn) {
      await genBtn.scrollIntoViewIfNeeded();
      await genBtn.click();
      // Phase walker runs ~3s on prod (600ms × 5 phases); wait for completion.
      await page.waitForTimeout(5500);
      const modal = await page.$('[data-testid="requirements-progress-modal"]');
      if (modal) {
        await modal.screenshot({ path: path.join(OUT_DIR, '05-requirements-modal.png') });
      } else {
        await page.screenshot({ path: path.join(OUT_DIR, '05-requirements-modal.png') });
      }
    }

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
