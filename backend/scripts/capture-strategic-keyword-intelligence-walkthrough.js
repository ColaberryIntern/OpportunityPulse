#!/usr/bin/env node
// Strategic Keyword Intelligence — walkthrough screenshot capture.

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
    await page.waitForTimeout(3500);

    console.log('1. OIED Mission Control top — Market Heat (default mode)…');
    await page.goto(`${BASE_URL}/admin/oied`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6500);
    await page.screenshot({ path: path.join(OUT_DIR, 'strat-01-market-heat.png'), fullPage: false });

    console.log('2. Mode selector visible…');
    const selector = await page.$('[data-testid="keyword-cloud-mode-selector"]');
    if (selector) {
      console.log('3. Switching to Procurement mode…');
      await selector.selectOption('procurement');
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(OUT_DIR, 'strat-02-procurement-mode.png'), fullPage: false });

      console.log('4. Switching to Strategic Composite mode…');
      await selector.selectOption('strategic');
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(OUT_DIR, 'strat-03-strategic-composite.png'), fullPage: false });

      console.log('5. Switching to Operational Pain mode…');
      await selector.selectOption('operational_pain');
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(OUT_DIR, 'strat-04-operational-pain.png'), fullPage: false });

      console.log('6. Switching to Convergence mode…');
      await selector.selectOption('convergence');
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(OUT_DIR, 'strat-05-convergence.png'), fullPage: false });
    } else {
      console.log('[warn] mode selector not found');
    }

    console.log('7. Strategic Discovery Panel…');
    const panel = await page.$('[data-testid="strategic-discovery-panel"]');
    if (panel) {
      await panel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await panel.screenshot({ path: path.join(OUT_DIR, 'strat-06-discovery-panel.png') });
    } else {
      console.log('[warn] discovery panel not found');
    }

    console.log('8-12. Each discovery sub-section…');
    const sections = [
      ['section-active-transitions', '07-active-transitions'],
      ['section-research-to-market', '08-research-to-market'],
      ['section-convergence', '09-convergence-section'],
      ['section-operational-pain', '10-operational-pain-section'],
      ['section-modernization', '11-modernization-section'],
    ];
    for (const [testId, slug] of sections) {
      console.log(`Capturing ${slug}…`);
      const el = await page.$(`[data-testid="${testId}"]`);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await el.screenshot({ path: path.join(OUT_DIR, `strat-${slug}.png`) });
      }
    }

    console.log('Done. Output dir:', OUT_DIR);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  finally { await ctx.close(); await browser.close(); }
})();
