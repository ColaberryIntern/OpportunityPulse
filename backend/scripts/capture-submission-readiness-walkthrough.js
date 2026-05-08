#!/usr/bin/env node
// Submission Readiness Engine v0.1 + v0.2 — visual walkthrough capture.
// Logs into prod as admin, takes full-page screenshots of every new
// surface (Document Vault, upload modal, Bonfire table with Readiness
// column, Bonfire detail panel before+after AI tailoring), saves under
// docs/submission-readiness-walkthrough-assets/.

const path = require('path');
const fs = require('fs');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
});

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD
  || process.env.ADMIN_DEFAULT_PASSWORD
  || '3yhEcVki3Vp4emDuuXWk';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'submission-readiness-walkthrough-assets');

async function shot(page, file, label) {
  const fp = path.join(OUT_DIR, file);
  await page.screenshot({ path: fp, fullPage: true });
  console.log(`  [shot] ${file} (${(fs.statSync(fp).size / 1024).toFixed(1)} KB) — ${label}`);
}

async function gotoAndShot(page, url, file, label, sentinelSel = null) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (sentinelSel) await page.waitForSelector(sentinelSel, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, file, label);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));

  try {
    // ---------------- Login ----------------
    console.log('Logging in as admin…');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);
    console.log(`  logged in, currently at ${page.url()}`);

    // ---------------- 01 Sidebar with Document Vault link ----------------
    await page.goto(`${BASE_URL}/admin/oied`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // Crop just the sidebar if we can find it; otherwise full page.
    let saved = false;
    for (const sel of ['nav.sidebar', 'aside[aria-label="Main navigation"]', 'aside.sidebar', 'nav[role="navigation"]']) {
      const loc = page.locator(sel).first();
      if (await loc.count()) {
        const fp = path.join(OUT_DIR, '01-sidebar-document-vault.png');
        try {
          await loc.screenshot({ path: fp });
          console.log(`  [shot] 01-sidebar-document-vault.png — sidebar with 📁 Document Vault link`);
          saved = true;
        } catch (_) { /* fall through */ }
        break;
      }
    }
    if (!saved) {
      await shot(page, '01-sidebar-document-vault.png', 'mission control (sidebar visible)');
    }

    // ---------------- 02 Document Vault — empty state ----------------
    await gotoAndShot(
      page, `${BASE_URL}/admin/documents`,
      '02-document-vault-empty.png',
      'Document Vault — empty state with summary cards',
      '[data-testid="upload-doc-btn"]',
    );

    // ---------------- 03 Document Vault — upload modal open ----------------
    await page.goto(`${BASE_URL}/admin/documents`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="upload-doc-btn"]', { timeout: 15000 }).catch(() => {});
    await page.click('[data-testid="upload-doc-btn"]').catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, '03-document-vault-upload-modal.png',
      'Document Vault — upload modal with type picker + expiry field');

    // ---------------- 04 Bonfire page — table with Readiness column ----------------
    await gotoAndShot(
      page, `${BASE_URL}/bonfire`,
      '04-bonfire-table-with-readiness-column.png',
      'Bonfire page — Readiness column with progress bar per row',
      'table',
    );

    // ---------------- 05 Bonfire detail panel — initial (no AI yet) ----------------
    await page.goto(`${BASE_URL}/bonfire`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // Click the first Title button to open the detail panel.
    const firstTitle = page.locator('table tbody tr button').first();
    if (await firstTitle.count()) {
      await firstTitle.click().catch(() => {});
      await page.waitForTimeout(3000);
      await shot(page, '05-bonfire-detail-readiness-baseline.png',
        'Bonfire detail panel — Submission Readiness card, baseline checklist (no AI yet)');
    } else {
      console.log('  ⚠ no bonfire row found; skipping detail panel shots');
    }

    // ---------------- 06 Bonfire detail panel — after Tailor with AI ----------------
    // Look for the Tailor-with-AI button by data-testid or by text.
    const aiBtn = page.locator('button', { hasText: /Tailor with AI|Refresh AI/i }).first();
    if (await aiBtn.count()) {
      try {
        await aiBtn.click({ timeout: 5000 });
        // Wait for the analysing state, then for it to complete (button text returns).
        await page.waitForTimeout(2500);
        // Wait up to 25s for the AI call to complete.
        const deadline = Date.now() + 25000;
        while (Date.now() < deadline) {
          const text = (await aiBtn.textContent().catch(() => '')) || '';
          if (!/Analyzing/i.test(text)) break;
          await page.waitForTimeout(1500);
        }
        await page.waitForTimeout(1500);
        await shot(page, '06-bonfire-detail-readiness-ai-tailored.png',
          'Bonfire detail panel — after Tailor with AI (summary + AI source pills + RFP quotes if any)');
      } catch (e) {
        console.log('  ⚠ Tailor-with-AI click flow failed:', e.message);
      }
    }

    console.log('All shots complete.');
  } catch (e) {
    console.error('Capture failed:', e.message, e.stack);
    process.exit(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
