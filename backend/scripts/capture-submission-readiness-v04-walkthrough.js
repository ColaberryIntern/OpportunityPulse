#!/usr/bin/env node
// v0.4 walkthrough capture — Bonfire RFP attachment locker.
//   01: detail drawer with Attachments panel empty state
//   02: detail drawer mid-fetch (button shows ⏳ Fetching…)
//   03: detail drawer after fetch (with last-fetch banner — CF-blocked is the prod reality today)

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD
  || '3yhEcVki3Vp4emDuuXWk';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'submission-readiness-v04-walkthrough-assets');

async function shot(page, file, label) {
  const fp = path.join(OUT_DIR, file);
  await page.screenshot({ path: fp, fullPage: true });
  console.log(`  [shot] ${file} (${(fs.statSync(fp).size / 1024).toFixed(1)} KB) — ${label}`);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  // Tall viewport — the Bonfire detail drawer uses h-full + overflow-auto,
  // which means with a normal viewport the new Attachments panel sits
  // below the drawer's internal scroll. A tall viewport makes the
  // drawer's full content render in one screen so fullPage captures it.
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 2400 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));

  try {
    console.log('Logging in…');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);

    console.log('Opening Bonfire detail drawer…');
    await page.goto(`${BASE_URL}/bonfire`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const firstTitle = page.locator('table tbody tr button').first();
    if (!(await firstTitle.count())) {
      console.log('  ⚠ no bonfire row found');
      process.exit(0);
    }
    await firstTitle.click();
    await page.waitForTimeout(3500);

    // No-op stub kept so the existing call sites still work — the tall
    // viewport on the browser context now handles the drawer-overflow issue.
    async function expandDrawerForCapture() {
      await page.waitForTimeout(800);
    }
    await expandDrawerForCapture();

    // 01 — empty state of the Attachments panel
    await shot(page, '01-bonfire-detail-attachments-empty.png',
      'Bonfire detail drawer with the new 📎 RFP Attachments panel (empty state)');

    // 02 — kick off fetch and shoot mid-flight
    const fetchBtn = page.locator('button', { hasText: /Fetch from Bonfire/i }).first();
    if (await fetchBtn.count()) {
      try {
        await fetchBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1500);
        await expandDrawerForCapture();
        await shot(page, '02-bonfire-detail-attachments-fetching.png',
          'Mid-fetch: ⏳ Fetching… while Playwright runs in the background');
        // Wait for it to complete so the banner shows
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
          const text = (await fetchBtn.textContent().catch(() => '')) || '';
          if (!/Fetching/i.test(text)) break;
          await page.waitForTimeout(2500);
        }
        await page.waitForTimeout(1500);
        await expandDrawerForCapture();
        // 03 — post-fetch with the last-fetch result banner
        await shot(page, '03-bonfire-detail-attachments-result.png',
          'After fetch: last-fetch result banner (Cloudflare-blocked on prod today, but the panel state is shown)');
      } catch (e) {
        console.log('  ⚠ fetch click flow failed:', e.message);
      }
    }

    console.log('Done.');
  } catch (e) {
    console.error('Capture failed:', e.message);
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
