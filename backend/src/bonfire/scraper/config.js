// Centralized config reader for the scraper. All env access funnels through here so
// tests can mock a single module instead of `process.env` directly.

const path = require('path');
const { env } = require('../../config/environment');

function getScraperConfig() {
  // Re-read each call so tests / live toggles see the latest values. Cheap.
  return {
    enabled: env.bonfire.scraper.enabled,
    cronEnabled: env.bonfire.scraper.cronEnabled,
    cron: env.bonfire.scraper.cron,
    headless: env.bonfire.scraper.headless,
    username: env.bonfire.scraper.username,
    password: env.bonfire.scraper.password,
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

module.exports = { getScraperConfig, isScraperEnabled };
