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
//
// Multi-account: every function takes an `account = {label, username, password}`
// arg. The legacy single-account call path resolves the account from the
// scraper config's first entry, so older callers keep working unchanged.

const logger = require('../../logging/logger');
const { getScraperConfig } = require('./config');
const { persistStorageState, clearStorageState, jitter } = require('./browser');
const { isChallengePage } = require('./cloudflare');

class LoginFailed extends Error {
  constructor(message, { url, label } = {}) {
    super(message);
    this.name = 'LoginFailed';
    this.url = url;
    this.label = label;
  }
}

// Resolve a default account when the caller didn't pass one. Returns the first
// account in the configured list, which mirrors legacy single-account semantics.
function resolveAccount(account) {
  if (account && account.username && account.password) return account;
  const cfg = getScraperConfig();
  const first = (cfg.accounts && cfg.accounts[0])
    || (cfg.username && cfg.password
        ? { label: 'default', username: cfg.username, password: cfg.password }
        : null);
  if (!first) {
    throw new LoginFailed('Bonfire credentials are not configured');
  }
  return first;
}

async function performLogin(context, account) {
  const cfg = getScraperConfig();
  const acct = resolveAccount(account);

  const page = await context.newPage();
  try {
    await page.goto(cfg.loginUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
    await page.waitForTimeout(3000);

    // Step 1: email page
    await page.fill('#input-email', acct.username);
    await page.click('button[type=submit]');
    await page.waitForTimeout(3000);

    // Step 2: password page (separate render)
    await page.fill('input[type=password]', acct.password);
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
        { url: finalUrl, label: acct.label }
      );
    }

    await persistStorageState(context, acct.label);
    logger.info('Bonfire login successful', { url: finalUrl, account: acct.label });
  } finally {
    await page.close().catch(() => {});
  }
}

// Verify the cached storageState still works. Cheaper than a full login when valid.
async function verifyExistingSession(context, account) {
  const cfg = getScraperConfig();
  // resolveAccount is only used for label-resolution telemetry here; not required
  // for the page navigation itself, but useful for logging in callers.
  const acct = account || (cfg.accounts && cfg.accounts[0]) || { label: 'default' };
  const page = await context.newPage();
  try {
    await page.goto(cfg.dashboardUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
    await page.waitForTimeout(2000);
    const url = page.url();
    const ok = url.includes('/settings/dashboard');
    if (ok) logger.info('Bonfire session verified', { account: acct.label });
    return ok;
  } catch {
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

async function ensureLoggedIn(context, account) {
  const acct = resolveAccount(account);
  const ok = await verifyExistingSession(context, acct);
  if (ok) {
    logger.info('Bonfire session reused from cache', { account: acct.label });
    return;
  }
  // Cache stale or missing — log in fresh.
  clearStorageState(acct.label);
  await performLogin(context, acct);
}

// Open an agency portal via the per-subdomain login redirect URL.
// Returns the navigated page if authenticated; throws if Cloudflare blocks.
async function openAgencyPortal(context, subdomainOrAccount, subdomainArg, opts) {
  // Back-compat overload: legacy call sites pass (context, subdomain, opts).
  // New call sites pass (context, account, subdomain, opts).
  let account, subdomain, options;
  if (typeof subdomainOrAccount === 'string') {
    account = null;
    subdomain = subdomainOrAccount;
    options = subdomainArg || {};
  } else {
    account = subdomainOrAccount;
    subdomain = subdomainArg;
    options = opts || {};
  }
  const cfg = getScraperConfig();
  const acct = resolveAccount(account);
  const { bouncePath = '/opportunities' } = options;
  const enc = encodeURIComponent(acct.username);
  const bounceEnc = encodeURIComponent(bouncePath);
  const url = `https://${subdomain}.bonfirehub.com/login?email=${enc}&bounceUrl=${bounceEnc}`;

  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
    // Up to 10s for the auth redirect to complete or Cloudflare to render.
    await jitter(5000, 5000);

    if (await isChallengePage(page)) {
      return { page, blocked: true, reason: 'cloudflare', account: acct.label };
    }
    if (page.url().includes('/login')) {
      return { page, blocked: true, reason: 'redirect-stalled', account: acct.label };
    }
    return { page, blocked: false, account: acct.label };
  } catch (e) {
    return { page, blocked: true, reason: e.message, account: acct.label };
  }
}

module.exports = {
  ensureLoggedIn,
  performLogin,
  verifyExistingSession,
  openAgencyPortal,
  resolveAccount,
  LoginFailed,
};
