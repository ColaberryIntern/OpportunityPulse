#!/usr/bin/env node
// Deep Research Intelligence Engine — Phase 3 walkthrough screenshot capture.
//
// Captures, into docs/deep-research-assets/:
//   p3-01-execution-dashboard.png — the execution intelligence dashboard
//   p3-02-pipeline-flow.png       — the opportunity pipeline flow
//   p3-03-venture-execution.png   — a venture's execution intelligence panel
//   p3-04-report-full.png         — the report page with execution panels

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

  // Resolve the latest seeded sample report id.
  let reportId = null;
  for (let i = 30; i >= 1 && !reportId; i -= 1) {
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

    // p3-01 — execution dashboard
    console.log('1. execution dashboard…');
    await page.goto(`${BASE_URL}/admin/deep-research/execution`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p3-01-execution-dashboard.png'), fullPage: true });

    // p3-02 — pipeline flow (the flow component)
    console.log('2. pipeline flow…');
    const flow = await page.$('[data-testid="pipeline-flow"]');
    if (flow) {
      await flow.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await flow.screenshot({ path: path.join(OUT_DIR, 'p3-02-pipeline-flow.png') });
    }

    // p3-03 — venture execution panel (expand it on the report page)
    console.log('3. venture execution panel…');
    await page.goto(`${BASE_URL}/admin/deep-research/${reportId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    // Expand the first venture's Execution Intelligence panel.
    const toggle = await page.$('[data-testid^="venture-execution-"] button');
    if (toggle) {
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
      await page.waitForTimeout(2500); // let getVentureExecution resolve
      const panel = await page.$('[data-testid^="venture-execution-"]');
      if (panel) await panel.screenshot({ path: path.join(OUT_DIR, 'p3-03-venture-execution.png') });
    }

    // p3-04 — full report page
    console.log('4. full report…');
    await page.screenshot({ path: path.join(OUT_DIR, 'p3-04-report-full.png'), fullPage: true });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
