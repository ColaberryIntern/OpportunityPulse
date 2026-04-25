// Phase A/B/C orchestration. Pure-ish: takes a context and a set of "deps"
// (parsers + service) so tests can mock them without launching a browser.

const logger = require('../../logging/logger');
const service = require('../bonfire.service');
const { getScraperConfig } = require('./config');
const { ensureLoggedIn, openAgencyPortal } = require('./session');
const { jitter } = require('./browser');
const vendorDashboard = require('./pages/vendorDashboard');
const networkList = require('./pages/networkList');
const agencyOpportunities = require('./pages/agencyOpportunities');
const normalize = require('./normalize');
const escalation = require('./escalation');

// Catastrophic-failure heuristics, per the plan:
// - Login fails (signaled by ensureLoggedIn throwing).
// - Vendor dashboard yields no records when phase >= A.
// - Network parser yields fewer than NETWORK_MIN_AGENCIES (82 expected).
// - 100% of attempted agency portals are blocked.
const NETWORK_MIN_AGENCIES = 10;

async function runScrape(opts = {}, deps = {}) {
  const cfg = getScraperConfig();
  const phase = (opts.phase || cfg.phase || 'C').toUpperCase();
  const dryRun = !!opts.dryRun;

  // Dependency injection. Tests pass in mocks; production uses the real modules.
  const $ = {
    launchBrowser: deps.launchBrowser || (() => require('./browser').launchBrowser()),
    createContext: deps.createContext || (async (b) => require('./browser').createContext(b)),
    ensureLoggedIn: deps.ensureLoggedIn || ensureLoggedIn,
    openAgencyPortal: deps.openAgencyPortal || openAgencyPortal,
    parseDashboard: deps.parseDashboard || vendorDashboard.parse,
    parseNetwork: deps.parseNetwork || networkList.parse,
    parseAgencyOpps: deps.parseAgencyOpps || agencyOpportunities.parse,
    upsert: deps.upsert || service.upsertJsonArray,
    sleep: deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
  };

  const summary = {
    phase,
    dryRun,
    startedAt: new Date().toISOString(),
    counts: null,
    aiRecommendedFound: 0,
    networkAgenciesFound: 0,
    agenciesAttempted: 0,
    agenciesBlocked: [],
    opportunitiesUpserted: 0,
    opportunitiesInsertedNoId: 0,
    errors: [],
  };

  let browser, context;
  try {
    browser = await $.launchBrowser();
    context = await $.createContext(browser);
    await $.ensureLoggedIn(context);

    // Phase A — vendor hub dashboard (counts + AI-recommended cards).
    const dashboardPage = await context.newPage();
    try {
      await dashboardPage.goto(cfg.vendorHubUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
      await dashboardPage.waitForTimeout(4000);
      const dash = await $.parseDashboard(dashboardPage);
      summary.counts = dash.counts || {};
      summary.aiRecommendedFound = (dash.aiRecommended || []).length;
      summary.aiRecommendedHref = dash.aiRecommendedHref || null;
      // AI-recommended cards live on a separate page (/opportunities/recommended)
      // in current Bonfire. We log the link if present and let a future iteration
      // fetch it; the absence of inline cards is NOT an error.

      const recRows = (dash.aiRecommended || [])
        .map((c) => normalize.fromVendorRecCard(c))
        .filter(Boolean);
      if (recRows.length && !dryRun) {
        const out = await $.upsert(recRows);
        summary.opportunitiesUpserted += (out.upserted || 0);
        summary.opportunitiesInsertedNoId += (out.insertedWithoutExternalId || 0);
      }
    } finally {
      await dashboardPage.close().catch(() => {});
    }

    if (phase === 'A') {
      escalation.recordSuccess();
      summary.endedAt = new Date().toISOString();
      return summary;
    }

    // Phase B / C — agency portal scrape. First parse the network list.
    // parseNetwork manages its own page so it can attach a response listener
    // BEFORE navigation (the agency XHR fires during hydration).
    let agencies = [];
    try {
      agencies = await $.parseNetwork(context, cfg.vendorNetworkUrl, {
        navTimeoutMs: cfg.navTimeoutMs,
        postNavWaitMs: 8000,
      });
      summary.networkAgenciesFound = agencies.length;
    } catch (e) {
      summary.errors.push({ stage: 'network', reason: e.message });
    }

    if (agencies.length < NETWORK_MIN_AGENCIES) {
      summary.errors.push({
        stage: 'network',
        reason: `parser returned ${agencies.length} agencies; expected at least ${NETWORK_MIN_AGENCIES}`,
      });
    }

    // Apply allow-list with fallback. If the allow-list is set we iterate
    // exactly those subdomains regardless of whether the (sometimes-flaky)
    // network list surfaced them. If empty we use whatever the network list
    // returned. Phase B implies allow-list defaults to ['dhantx'] when empty.
    let targetAgencies;
    let allowList = cfg.agencyAllowlist.length ? cfg.agencyAllowlist : (phase === 'B' ? ['dhantx'] : null);
    if (allowList) {
      // Prefer network metadata when we have it, but fall back to bare subdomain.
      targetAgencies = allowList.map((sub) => {
        const found = agencies.find((a) => a.subdomain === sub);
        return found || { subdomain: sub, name: sub };
      });
    } else {
      // Phase C, no allow-list = whatever the network list returned.
      targetAgencies = agencies;
    }

    for (const agency of targetAgencies) {
      summary.agenciesAttempted += 1;
      await $.sleep(cfg.perAgencyDelayMs + Math.floor(Math.random() * 2000));

      let portal;
      try {
        portal = await $.openAgencyPortal(context, agency.subdomain);
      } catch (e) {
        summary.errors.push({ stage: 'portal', subdomain: agency.subdomain, reason: e.message });
        continue;
      }

      try {
        if (portal.blocked) {
          summary.agenciesBlocked.push({ subdomain: agency.subdomain, reason: portal.reason });
          continue;
        }
        const result = await $.parseAgencyOpps(portal.page);
        if (result.blocked) {
          summary.agenciesBlocked.push({ subdomain: agency.subdomain, reason: 'parser-flagged' });
          continue;
        }

        const rows = result.records
          .map((r) => normalize.fromAgencyOpportunity(r, agency.subdomain, { agencyName: agency.name }))
          .filter(Boolean);

        if (rows.length && !dryRun) {
          const out = await $.upsert(rows);
          summary.opportunitiesUpserted += (out.upserted || 0);
          summary.opportunitiesInsertedNoId += (out.insertedWithoutExternalId || 0);
        }
      } catch (e) {
        // Surface inner Sequelize validation messages — the bare message often
        // says only "Validation error" without naming the failing field.
        const detail = (e.errors && Array.isArray(e.errors))
          ? e.errors.map((err) => `${err.path}: ${err.message}`).join('; ')
          : e.message;
        summary.errors.push({ stage: 'agency-parse', subdomain: agency.subdomain, reason: detail });
      } finally {
        if (portal && portal.page) await portal.page.close().catch(() => {});
      }
    }

    // A run is "fatal" only if NO useful data came in. We tolerate isolated
    // gaps (e.g. AI-rec cards moved to a separate page, network list broken,
    // partial Cloudflare blocks) as long as something concrete was upserted
    // OR we got valid dashboard counts back.
    const upsertedSomething = summary.opportunitiesUpserted > 0;
    const dashboardWorked = summary.counts && Object.keys(summary.counts).length > 0;
    const allAttemptedBlocked = summary.agenciesAttempted > 0
      && summary.agenciesBlocked.length === summary.agenciesAttempted;

    const fatal =
      // We attempted agencies and ALL were blocked, AND dashboard didn't help.
      (allAttemptedBlocked && !dashboardWorked)
      // OR we got nothing at all.
      || (!upsertedSomething && !dashboardWorked);

    if (fatal) {
      const reason = allAttemptedBlocked
        ? '100% of attempted agency portals blocked by Cloudflare'
        : 'no opportunities upserted and no dashboard data';
      escalation.recordFailure(reason);
      summary.escalated = true;
      summary.errors.push({ stage: 'fatal', reason });
    } else {
      escalation.recordSuccess();
    }

    summary.endedAt = new Date().toISOString();
    logger.info('Bonfire scrape run complete', summary);
    return summary;
  } catch (e) {
    escalation.recordFailure(e.message);
    summary.errors.push({ stage: 'top', reason: e.message });
    summary.endedAt = new Date().toISOString();
    summary.escalated = true;
    logger.error('Bonfire scrape run failed', { error: e.message });
    return summary;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { runScrape, NETWORK_MIN_AGENCIES };
