#!/usr/bin/env node
// v0.8 — capture each of the 4 readiness states by transitioning the same
// opp on the backend between snapshots, so we get visual coverage of:
//   01-pre-pursuit.png
//   02-pursuing-no-attachments.png
//   03-attachments-only.png   (deferred — needs a real upload to demo cleanly)
//   04-list-with-pursuing-pill.png

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD || '3yhEcVki3Vp4emDuuXWk';
const OPP_ID = process.env.OIED_BONFIRE_OPP_ID || 'b8335473-53a3-441b-bb21-ad63157a4a0b';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'submission-readiness-v08-walkthrough-assets');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 1800 },
    storageState: undefined,
  });
  // Use Playwright's request fixture for direct API calls (token reuse).
  const loginRes = await ctx.request.post(`${BASE_URL}/api/v1/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const loginBody = await loginRes.json();
  const token = loginBody?.data?.accessToken || loginBody?.data?.token || loginBody?.token;
  if (!token) { console.error('Login failed'); process.exit(1); }
  const apiHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function apiPost(p, body = {}) {
    return ctx.request.post(`${BASE_URL}/api/v1${p}`, {
      headers: apiHeaders, data: body,
    });
  }
  // Reset to none in case prior run left it dirty.
  await apiPost(`/bonfire/opportunities/${OPP_ID}/cancel-pursuit`, { to: 'none' });

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

    const url = `${BASE_URL}/admin/bonfire/${OPP_ID}/submission-readiness`;

    // STATE 1 — pre-pursuit
    console.log('1. pre-pursuit…');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, '01-pre-pursuit.png'), fullPage: true });

    // STATE 2 — pursuing-no-attachments
    console.log('2. pursuing-no-attachments…');
    await apiPost(`/bonfire/opportunities/${OPP_ID}/pursue`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, '02-pursuing-no-attachments.png'), fullPage: true });

    // STATE 4 — list with pursuing pill
    console.log('4. list with pursuing pill…');
    await page.goto(`${BASE_URL}/bonfire`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '04-list-with-pursuing-pill.png'), fullPage: true });

    // Reset for cleanliness.
    await apiPost(`/bonfire/opportunities/${OPP_ID}/cancel-pursuit`, { to: 'none' });

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) {
    console.error('FAIL:', e.message);
    await apiPost(`/bonfire/opportunities/${OPP_ID}/cancel-pursuit`, { to: 'none' }).catch(() => {});
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
