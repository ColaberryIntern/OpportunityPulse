#!/usr/bin/env node
// Deep Research Phase 10 — operational scalability + execution infrastructure walkthrough.

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

    console.log('1. Capture Infrastructure dashboard full page…');
    await page.goto(`${BASE_URL}/admin/deep-research/capture-infra`, { waitUntil: 'domcontentloaded' });
    // Either the loading skeleton or the live page; whichever is visible.
    await page.waitForSelector('[data-testid="capture-infra-page"], [data-testid="capture-infra-loading"]', { timeout: 30000 });
    await page.waitForTimeout(6000);
    await page.screenshot({
      path: path.join(OUT_DIR, 'p10-01-capture-infra-full.png'),
      fullPage: true,
    });

    console.log('2. Operator actions bar…');
    const actions = await page.$('[data-testid="capture-infra-actions"]');
    if (actions) {
      await actions.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await actions.screenshot({ path: path.join(OUT_DIR, 'p10-02-actions.png') });
    }

    console.log('3. Durable Worker section…');
    const worker = await page.$('[data-testid="section-worker"]');
    if (worker) {
      await worker.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await worker.screenshot({ path: path.join(OUT_DIR, 'p10-03-worker.png') });
    }

    console.log('4. Queue Throughput section…');
    const queue = await page.$('[data-testid="section-queue"]');
    if (queue) {
      await queue.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await queue.screenshot({ path: path.join(OUT_DIR, 'p10-04-queue.png') });
    }

    console.log('5. SLA Pressure section…');
    const sla = await page.$('[data-testid="section-sla"]');
    if (sla) {
      await sla.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await sla.screenshot({ path: path.join(OUT_DIR, 'p10-05-sla.png') });
    }

    console.log('6. Artifact Lifecycle section…');
    const arts = await page.$('[data-testid="section-artifacts"]');
    if (arts) {
      await arts.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await arts.screenshot({ path: path.join(OUT_DIR, 'p10-06-artifacts.png') });
    }

    console.log('7. Proposal Execution Queue section…');
    const exec = await page.$('[data-testid="section-exec-queue"]');
    if (exec) {
      await exec.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await exec.screenshot({ path: path.join(OUT_DIR, 'p10-07-exec-queue.png') });
    }

    console.log('8. Recent Worker Jobs section…');
    const jobs = await page.$('[data-testid="section-recent-jobs"]');
    if (jobs) {
      await jobs.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await jobs.screenshot({ path: path.join(OUT_DIR, 'p10-08-recent-jobs.png') });
    }

    console.log('9. Execution Failures section…');
    const fails = await page.$('[data-testid="section-failures"]');
    if (fails) {
      await fails.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await fails.screenshot({ path: path.join(OUT_DIR, 'p10-09-failures.png') });
    }

    console.log('10. Storage Backend section…');
    const storage = await page.$('[data-testid="section-storage"]');
    if (storage) {
      await storage.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await storage.screenshot({ path: path.join(OUT_DIR, 'p10-10-storage.png') });
    }

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
