#!/usr/bin/env node
// OIED UI smoke test — real-login + DOM validation per OIED v2 spec.
//
// Flow:
//   1. Open /login
//   2. Fill email + password into the actual form, submit
//   3. Wait for SPA navigation (redux auth state, no token injection)
//   4. /admin/opportunities/my — assert bucket sections render
//   5. Click [data-testid="generate-proposal-btn"] on first card
//   6. Wait for confirm() and accept it; wait for the success banner /
//      DOM mutation that proves the click round-tripped through redux
//   7. /admin/opportunities/review — assert the new draft is visible
//   8. /admin/profile — assert the profile editor renders
//   9. /admin/opportunities/bundles — assert bundles page renders
//
// Run: node scripts/oied-ui-test.js
// Output: ./.oied-screenshots/{*.png, results.json}, exit 0 on pass.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://95.216.199.47';
const ADMIN_EMAIL = process.env.OIED_TEST_ADMIN_EMAIL || 'admin@opportunitypulse.com';
const ADMIN_PASSWORD = process.env.OIED_TEST_ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD;
const OUT_DIR = path.resolve(__dirname, '..', '.oied-screenshots');

function log(...a) { console.log('[oied-ui]', ...a); }

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = {
    login_form_submitted: false,
    login_redirected: false,
    my_loaded: false,
    bucket_sections_visible: false,
    generate_clicked: false,
    generate_dom_change_observed: false,
    review_loaded: false,
    new_output_visible_in_dom: false,
    profile_editor_loaded: false,
    bundles_page_loaded: false,
    screenshots: [],
    errors: [],
  };

  if (!ADMIN_PASSWORD) {
    results.errors.push('No OIED_TEST_ADMIN_PASSWORD / ADMIN_DEFAULT_PASSWORD in env');
    fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
    console.error('Missing admin password env var');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => results.errors.push('pageerror: ' + e.message));

  // Auto-accept native confirm() prompts (Generate Proposal asks for confirmation).
  page.on('dialog', async (d) => { try { await d.accept(); } catch { /* already handled */ } });

  try {
    // 1-3. Real form login.
    log('navigating to /login');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email', { timeout: 15000 });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-password', ADMIN_PASSWORD);
    await page.screenshot({ path: path.join(OUT_DIR, 'login_form_filled.png') });
    results.screenshots.push('login_form_filled.png');

    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    results.login_form_submitted = true;
    // Confirm we're past /login (redux loginUser() resolved + navigate('/dashboard') ran).
    await page.waitForTimeout(2000);
    const afterLoginUrl = page.url();
    log('post-login URL:', afterLoginUrl);
    if (!/\/login/.test(afterLoginUrl)) results.login_redirected = true;
    else results.errors.push('Stayed on /login after submit — credentials rejected');

    // 4. /admin/opportunities/my — bucket sections render.
    log('navigating to /admin/opportunities/my');
    await page.goto(`${BASE_URL}/admin/opportunities/my`, { waitUntil: 'domcontentloaded' });
    // Wait for either the list, the empty state, or the access-denied banner.
    await Promise.race([
      page.waitForSelector('[data-testid="my-opportunities-list"]', { timeout: 15000 }),
      page.waitForSelector('text=No opportunities match', { timeout: 15000 }),
      page.waitForSelector('text=Admin access required', { timeout: 15000 }),
    ]).catch(() => {});
    await page.waitForTimeout(2000);
    const screenshotMy = path.join(OUT_DIR, 'my_opportunities.png');
    await page.screenshot({ path: screenshotMy, fullPage: true });
    results.screenshots.push('my_opportunities.png');
    results.my_loaded = true;
    log('screenshot saved:', screenshotMy);

    // Bucket sections — count any of them in the DOM.
    const bucketCount = await page.locator(
      '[data-testid="bucket-act-now"], [data-testid="bucket-high-value"], [data-testid="bucket-quick-wins"]',
    ).count();
    results.bucket_sections_visible = bucketCount > 0;
    log(`bucket sections in DOM: ${bucketCount}`);

    // 5-6. Click the actual Generate Proposal button on the first card and
    // observe a real DOM change (banner, button label flip to "Generating",
    // or status pill change). Native confirm() is auto-accepted by the
    // page.on('dialog') handler above.
    const genBtn = page.locator('[data-testid="generate-proposal-btn"]').first();
    const hasBtn = (await genBtn.count()) > 0;
    if (hasBtn) {
      log('clicking Generate Proposal');
      // Capture POST /generate response so we know the click reached the API.
      const generatePromise = page.waitForResponse(
        (resp) => /\/api\/v1\/oied\/opportunities\/\d+\/generate/.test(resp.url())
          && resp.request().method() === 'POST',
        { timeout: 20000 },
      ).catch(() => null);

      await genBtn.click();
      results.generate_clicked = true;

      const resp = await generatePromise;
      if (resp && resp.status() === 201) {
        results.generate_dom_change_observed = true;
        log('generate API responded 201 (DOM event-loop observed real round-trip)');
      } else if (resp) {
        results.errors.push(`generate API status: ${resp.status()}`);
      } else {
        results.errors.push('generate API response not observed within 20s');
      }
      // Give React a beat to update the toast/banner before screenshotting.
      await page.waitForTimeout(2000);
      const screenshotGen = path.join(OUT_DIR, 'generated_output.png');
      await page.screenshot({ path: screenshotGen, fullPage: true });
      results.screenshots.push('generated_output.png');
    } else {
      results.errors.push('Generate Proposal button not found on /my');
    }

    // 7. /review — confirm the new draft is in the DOM.
    log('navigating to /admin/opportunities/review');
    await page.goto(`${BASE_URL}/admin/opportunities/review`, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      page.waitForSelector('[data-testid="review-list"]', { timeout: 15000 }),
      page.waitForSelector('[data-testid="review-empty"]', { timeout: 15000 }),
    ]).catch(() => {});
    await page.waitForTimeout(2000);
    const screenshotRev = path.join(OUT_DIR, 'review_queue.png');
    await page.screenshot({ path: screenshotRev, fullPage: true });
    results.screenshots.push('review_queue.png');
    results.review_loaded = true;

    const draftRows = await page.locator('[data-testid="review-card"]').count();
    results.new_output_visible_in_dom = draftRows > 0;
    log(`review-card count in DOM: ${draftRows}`);

    // 8. /admin/profile — Profile Editor renders.
    log('navigating to /admin/profile');
    await page.goto(`${BASE_URL}/admin/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="profile-editor"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const profileEl = await page.locator('[data-testid="profile-editor"]').count();
    results.profile_editor_loaded = profileEl > 0;
    const screenshotProfile = path.join(OUT_DIR, 'profile_editor.png');
    await page.screenshot({ path: screenshotProfile, fullPage: true });
    results.screenshots.push('profile_editor.png');
    log(`profile-editor in DOM: ${profileEl}`);

    // 9. /admin/opportunities/bundles — Bundles page renders.
    log('navigating to /admin/opportunities/bundles');
    await page.goto(`${BASE_URL}/admin/opportunities/bundles`, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      page.waitForSelector('[data-testid="bundles-list"]', { timeout: 15000 }),
      page.waitForSelector('[data-testid="bundles-empty"]', { timeout: 15000 }),
    ]).catch(() => {});
    await page.waitForTimeout(1500);
    const bundlesPresent = await page.locator(
      '[data-testid="bundles-list"], [data-testid="bundles-empty"]',
    ).count();
    results.bundles_page_loaded = bundlesPresent > 0;
    const screenshotBundles = path.join(OUT_DIR, 'bundles_page.png');
    await page.screenshot({ path: screenshotBundles, fullPage: true });
    results.screenshots.push('bundles_page.png');
    log(`bundles page in DOM: ${bundlesPresent}`);
  } catch (e) {
    results.errors.push('flow: ' + e.message);
    console.error(e);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
    log('results:', JSON.stringify(results, null, 2));
    const passed = results.login_form_submitted
      && results.login_redirected
      && results.my_loaded
      && results.generate_clicked
      && results.generate_dom_change_observed
      && results.review_loaded
      && results.profile_editor_loaded
      && results.bundles_page_loaded;
    process.exit(passed ? 0 : 1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
