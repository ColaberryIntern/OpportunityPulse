// Multi-step Bonfire login.
//
// Critical detail from the access guide: email and password are on SEPARATE pages.
// Filling both at once fails because the password field doesn't render until the
// email submit completes.
//
// Flow:
//   1. goto /login (domcontentloaded)
//   2. wait 3s
//   3. fill #input-email, click submit
//   4. wait 3s — password page is now rendered
//   5. fill input[type=password], click submit
//   6. wait 5s — should land on /settings/dashboard
//
// The redirect-bounce per-portal helper opens an agency subdomain via the auth
// query string so cookies set on the main domain are honored without re-prompting
// for credentials.

const logger = require('../../logging/logger');
const { getScraperConfig } = require('./config');
const { persistStorageState, clearStorageState, jitter } = require('./browser');
const { isChallengePage } = require('./cloudflare');

class LoginFailed extends Error {
  constructor(message, { url } = {}) {
    super(message);
    this.name = 'LoginFailed';
    this.url = url;
  }
}

async function performLogin(context) {
  const cfg = getScraperConfig();
  if (!cfg.username || !cfg.password) {
    throw new LoginFailed('Bonfire credentials are not configured');
  }

  const page = await context.newPage();
  try {
    await page.goto(cfg.loginUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
    await page.waitForTimeout(3000);

    // Step 1: email page
    await page.fill('#input-email', cfg.username);
    await page.click('button[type=submit]');
    await page.waitForTimeout(3000);

    // Step 2: password page (separate render)
    await page.fill('input[type=password]', cfg.password);
    await page.click('button[type=submit]');
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    if (!finalUrl.includes('/settings/dashboard')) {
      // If Bonfire flips a captcha/challenge page in front of login, it'll usually
      // return a Cloudflare-style page — treat that as a login failure with a
      // distinct message so escalation can branch on it.
      const blocked = await isChallengePage(page);
      throw new LoginFailed(
        blocked
          ? 'login intercepted by Cloudflare/captcha'
          : `login did not reach /settings/dashboard (got ${finalUrl})`,
        { url: finalUrl }
      );
    }

    await persistStorageState(context);
    logger.info('Bonfire login successful', { url: finalUrl });
  } finally {
    await page.close().catch(() => {});
  }
}

// Verify the cached storageState still works. Cheaper than a full login when valid.
async function verifyExistingSession(context) {
  const cfg = getScraperConfig();
  const page = await context.newPage();
  try {
    await page.goto(cfg.dashboardUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
    await page.waitForTimeout(2000);
    const url = page.url();
    return url.includes('/settings/dashboard');
  } catch {
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

async function ensureLoggedIn(context) {
  const ok = await verifyExistingSession(context);
  if (ok) {
    logger.info('Bonfire session reused from cache');
    return;
  }
  // Cache stale or missing — log in fresh.
  clearStorageState();
  await performLogin(context);
}

// Open an agency portal via the per-subdomain login redirect URL.
// Returns the navigated page if authenticated; throws if Cloudflare blocks.
async function openAgencyPortal(context, subdomain, { bouncePath = '/opportunities' } = {}) {
  const cfg = getScraperConfig();
  const enc = encodeURIComponent(cfg.username);
  const bounceEnc = encodeURIComponent(bouncePath);
  const url = `https://${subdomain}.bonfirehub.com/login?email=${enc}&bounceUrl=${bounceEnc}`;

  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
    // Up to 10s for the auth redirect to complete or Cloudflare to render.
    await jitter(5000, 5000);

    if (await isChallengePage(page)) {
      return { page, blocked: true, reason: 'cloudflare' };
    }
    if (page.url().includes('/login')) {
      return { page, blocked: true, reason: 'redirect-stalled' };
    }
    return { page, blocked: false };
  } catch (e) {
    return { page, blocked: true, reason: e.message };
  }
}

module.exports = {
  ensureLoggedIn,
  performLogin,
  verifyExistingSession,
  openAgencyPortal,
  LoginFailed,
};
