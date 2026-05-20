// Centralized config reader for the scraper. All env access funnels through here so
// tests can mock a single module instead of `process.env` directly.

const path = require('path');
const { env } = require('../../config/environment');
const logger = require('../../logging/logger');

// Sanitize a label so it can be safely used in a filename.
// Lowercase, strip non-alnum, fall back to 'default'.
function sanitizeLabel(label) {
  const s = String(label || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '');
  return s || 'default';
}

// Parse the multi-account JSON env var. Returns [] on missing/malformed input —
// the caller is responsible for falling back to legacy single-account config.
function parseAccounts(raw) {
  if (!raw || typeof raw !== 'string') return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logger.warn('BONFIRE_SCRAPER_ACCOUNTS is set but is not valid JSON; falling back to legacy single-account env', { error: e.message });
    return [];
  }
  if (!Array.isArray(parsed)) {
    logger.warn('BONFIRE_SCRAPER_ACCOUNTS must be a JSON array of {label,username,password}; falling back');
    return [];
  }
  const out = [];
  const seenLabels = new Set();
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const username = String(item.username || '').trim();
    const password = String(item.password || '').trim();
    if (!username || !password) continue;
    let label = sanitizeLabel(item.label || username.split('@')[0]);
    // Deduplicate labels — two accounts with the same label would collide on
    // storageState filename. Suffix with a counter if needed.
    let suffix = 1;
    const base = label;
    while (seenLabels.has(label)) { suffix += 1; label = `${base}${suffix}`; }
    seenLabels.add(label);
    out.push({ label, username, password });
  }
  return out;
}

// Resolve the active account set. Always returns >=1 entry when credentials
// are configured at all. Returns [] when nothing is configured (login will
// throw downstream — preserves the existing missing-creds error path).
function resolveAccounts(envScraper) {
  const fromJson = parseAccounts(envScraper.accountsRaw);
  if (fromJson.length) return fromJson;
  // Legacy fallback: single-account env vars.
  if (envScraper.username && envScraper.password) {
    return [{
      label: sanitizeLabel(envScraper.username.split('@')[0] || 'default'),
      username: envScraper.username,
      password: envScraper.password,
    }];
  }
  return [];
}

function getScraperConfig() {
  // Re-read each call so tests / live toggles see the latest values. Cheap.
  const accounts = resolveAccounts(env.bonfire.scraper);
  // Preserve the legacy `username` / `password` top-level fields so any code
  // path that still reads them keeps working. They reflect the FIRST account.
  const primary = accounts[0] || { username: '', password: '' };
  return {
    enabled: env.bonfire.scraper.enabled,
    cronEnabled: env.bonfire.scraper.cronEnabled,
    cron: env.bonfire.scraper.cron,
    headless: env.bonfire.scraper.headless,
    accounts,
    username: primary.username,
    password: primary.password,
    phase: env.bonfire.scraper.phase, // 'A' | 'B' | 'C'
    agencyAllowlist: env.bonfire.scraper.agencyAllowlist,
    storageDir: path.resolve(env.bonfire.scraper.storageDir),
    sessionTtlMin: env.bonfire.scraper.sessionTtlMin,
    perAgencyDelayMs: env.bonfire.scraper.perAgencyDelayMs,
    autoEnrich: env.bonfire.scraper.autoEnrich,
    agencyFreshnessHours: env.bonfire.scraper.agencyFreshnessHours,
    shuffleAgencies: env.bonfire.scraper.shuffleAgencies,
    // Constants — not env-overridable on purpose.
    loginUrl: 'https://account.bonfirehub.com/login',
    dashboardUrl: 'https://account.bonfirehub.com/settings/dashboard',
    vendorHubUrl: 'https://vendor.bonfirehub.com/',
    // Bonfire renamed the My Network route from /network to /agencies somewhere
    // along the way. /network now 404s ("Page Not Found"). Don't change this
    // back without re-verifying with bonfire-discover-agencies.js.
    vendorNetworkUrl: 'https://vendor.bonfirehub.com/agencies',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    navTimeoutMs: 30000,
    defaultJitterMaxMs: 2000,
  };
}

function isScraperEnabled() {
  return getScraperConfig().enabled;
}

module.exports = { getScraperConfig, isScraperEnabled, parseAccounts, sanitizeLabel };
