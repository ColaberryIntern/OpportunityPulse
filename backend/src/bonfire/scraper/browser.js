// Browser launch + context creation. All anti-detection settings live here so a
// future change (e.g. trying playwright-extra-stealth) has exactly one touch point.
//
// IMPORTANT: never use `waitUntil: 'networkidle'` anywhere — Bonfire is a React SPA
// and `networkidle` will never settle. All navigations use `domcontentloaded` and
// explicit `waitForTimeout` calls per the Bonfire access guide.

const fs = require('fs');
const path = require('path');
const { getScraperConfig, sanitizeLabel } = require('./config');

// Per-account storage-state filename. The legacy single-account path
// (storageState.json with no suffix) is preserved as the "default" label so
// existing deploys don't lose their cached session on the next deploy.
function storageStatePath(label) {
  const cfg = getScraperConfig();
  const safe = sanitizeLabel(label || 'default');
  if (safe === 'default') {
    return path.join(cfg.storageDir, 'storageState.json');
  }
  return path.join(cfg.storageDir, `storageState-${safe}.json`);
}

function loadStorageStateIfFresh(label) {
  const cfg = getScraperConfig();
  const file = storageStatePath(label);
  if (!fs.existsSync(file)) return null;
  const ageMs = Date.now() - fs.statSync(file).mtimeMs;
  const ttlMs = cfg.sessionTtlMin * 60 * 1000;
  if (ageMs > ttlMs) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function ensureStorageDir() {
  const cfg = getScraperConfig();
  fs.mkdirSync(cfg.storageDir, { recursive: true });
}

// v0.10 — playwright-extra + stealth plugin patches headless Chromium's most
// obvious bot fingerprints (navigator.webdriver, plugins, languages, canvas
// noise, permissions, WebGL vendor, etc.) so Cloudflare's "Just a moment…"
// challenge actually clears. Without it, txdot.bonfirehub.com (and ~80% of
// agency Bonfire portals) silently stall on the JS challenge forever.
//
// We toggle this off via BONFIRE_SCRAPER_STEALTH=false if a future Playwright
// or stealth update breaks something — the plain `playwright` import is the
// fallback path.
async function launchBrowser({ headless } = {}) {
  const useStealth = process.env.BONFIRE_SCRAPER_STEALTH !== 'false';
  // Lazy require so unit tests that don't touch the browser don't pay the load
  // cost and don't fail when Playwright's binary isn't installed in CI.
  // eslint-disable-next-line global-require
  const playwright = useStealth ? require('playwright-extra') : require('playwright');
  if (useStealth) {
    // eslint-disable-next-line global-require
    const stealth = require('puppeteer-extra-plugin-stealth')();
    playwright.chromium.use(stealth);
  }
  const { chromium } = playwright;
  const cfg = getScraperConfig();
  // Production runs on Alpine where Playwright's bundled Chromium doesn't work —
  // the Dockerfile installs the system chromium and sets BONFIRE_CHROMIUM_PATH.
  // Locally on macOS/Windows, leave this unset so Playwright uses its bundled binary.
  const executablePath = process.env.BONFIRE_CHROMIUM_PATH || undefined;
  return chromium.launch({
    headless: headless == null ? cfg.headless : headless,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
}

async function createContext(browser, { useStoredSession = true, label } = {}) {
  const cfg = getScraperConfig();
  ensureStorageDir();
  const storageState = useStoredSession ? loadStorageStateIfFresh(label) : null;
  return browser.newContext({
    viewport: cfg.viewport,
    userAgent: cfg.userAgent,
    storageState: storageState || undefined,
  });
}

async function persistStorageState(context, label) {
  ensureStorageDir();
  await context.storageState({ path: storageStatePath(label) });
}

function clearStorageState(label) {
  const file = storageStatePath(label);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// Promise-based jitter helper. Call between navigations to avoid burst patterns.
async function jitter(baseMs, maxExtraMs) {
  const cfg = getScraperConfig();
  const max = maxExtraMs == null ? cfg.defaultJitterMaxMs : maxExtraMs;
  const delay = baseMs + Math.floor(Math.random() * max);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

module.exports = {
  launchBrowser,
  createContext,
  persistStorageState,
  clearStorageState,
  loadStorageStateIfFresh,
  storageStatePath,
  jitter,
};
