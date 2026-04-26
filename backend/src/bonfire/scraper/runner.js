// Phase A/B/C orchestration. Pure-ish: takes a context and a set of "deps"
// (parsers + service) so tests can mock them without launching a browser.

const logger = require('../../logging/logger');
const service = require('../bonfire.service');
const models = require('../../models');
const { getScraperConfig } = require('./config');
const { ensureLoggedIn, openAgencyPortal } = require('./session');
const { jitter } = require('./browser');
const vendorDashboard = require('./pages/vendorDashboard');
const networkList = require('./pages/networkList');
const agencyOpportunities = require('./pages/agencyOpportunities');
const normalize = require('./normalize');
const escalation = require('./escalation');
const agencyScoring = require('./agencyScoring');

// Fisher-Yates shuffle. Returns a NEW array; never mutates input.
function shuffleCopy(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Sort agencies priority_score DESC, then within each score bucket optionally
// shuffle so the exact iteration order varies run-to-run (anti-detection).
// Best-fit-for-us agencies always come first regardless of shuffle.
function sortAndShuffle(agencies, shuffle) {
  const buckets = new Map();
  for (const a of agencies) {
    const k = a._priorityScore != null ? a._priorityScore : 0;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(a);
  }
  const orderedKeys = [...buckets.keys()].sort((a, b) => b - a);
  const out = [];
  for (const k of orderedKeys) {
    const group = buckets.get(k);
    out.push(...(shuffle ? shuffleCopy(group) : group));
  }
  return out;
}

// Look up per-agency state. Returns a map { subdomain -> { lastScrapedAt, ... } }.
// Defensive: returns {} if the table doesn't exist yet (migration hasn't run).
async function loadAgencyState(subdomains, deps) {
  if (!subdomains.length) return {};
  const fetch = deps.findAgencyState || (async (subs) => {
    if (!models.BonfireAgency) return [];
    return models.BonfireAgency.findAll({ where: { subdomain: subs } });
  });
  try {
    const rows = await fetch(subdomains);
    const out = {};
    for (const r of rows) {
      out[r.subdomain] = {
        lastScrapedAt: r.lastScrapedAt,
        consecutiveBlocks: r.consecutiveBlocks || 0,
        lastOpenCount: r.lastOpenCount || 0,
        priorityScore: r.priorityScore != null ? r.priorityScore : null,
      };
    }
    return out;
  } catch (e) {
    logger.warn('Bonfire scrape: agency-state lookup failed; treating all as fresh', { error: e.message });
    return {};
  }
}

// Persist a per-agency outcome. Best-effort — failure to write doesn't abort
// the scrape (the opportunity rows are the load-bearing data).
async function recordAgencyOutcome(agency, outcome, deps) {
  const upsert = deps.upsertAgency || (async (rec) => {
    if (!models.BonfireAgency) return;
    await models.BonfireAgency.upsert(rec);
  });
  // Compute the agency's new priority_score from the fresh outcome + any
  // prior state. Used to sort the next run's iteration order.
  const priorityScore = agencyScoring.scoreAgency({
    subdomain: agency.subdomain,
    agencyName: agency.name,
    priorAgency: outcome.priorAgency,
    openCount: outcome.openCount,
    highFitCount: outcome.highFitCount,
    blocked: outcome.blocked,
    priorBlocks: outcome.priorBlocks,
  });
  try {
    await upsert({
      subdomain: agency.subdomain,
      name: agency.name,
      region: agency.region || null,
      lastScrapedAt: new Date(),
      lastSucceededAt: outcome.blocked ? null : new Date(),
      lastOpenCount: outcome.openCount != null ? outcome.openCount : 0,
      consecutiveBlocks: outcome.blocked ? (outcome.priorBlocks + 1) : 0,
      lastBlockReason: outcome.blocked ? String(outcome.reason || '').slice(0, 500) : null,
      priorityScore,
    });
  } catch (e) {
    logger.warn('Bonfire scrape: failed to record agency outcome', {
      subdomain: agency.subdomain,
      error: e.message,
    });
  }
}

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
  // Allow opts to override the scraper-config flag — useful for tests and for
  // a one-off `/scrape/run { autoEnrich: false }` admin call.
  const autoEnrich = opts.autoEnrich != null ? !!opts.autoEnrich : !!cfg.autoEnrich;
  const agencyFreshnessHours = opts.agencyFreshnessHours != null
    ? Number(opts.agencyFreshnessHours)
    : cfg.agencyFreshnessHours || 0;
  const shuffleAgencies = opts.shuffleAgencies != null
    ? !!opts.shuffleAgencies
    : !!cfg.shuffleAgencies;

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
    enrichAll: deps.enrichAll || service.enrichAllUnenriched,
    findAgencyState: deps.findAgencyState,
    upsertAgency: deps.upsertAgency,
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
      await maybeAutoEnrich(summary, $, autoEnrich, dryRun);
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

    // Order strategy:
    // 1. Always sort by priority_score DESC first — best-fit agencies for our
    //    situation (TX-region + high-volume + good fit) get scraped before
    //    a partial run gets killed.
    // 2. Within each priority bucket, optionally shuffle for anti-detection
    //    so two consecutive runs don't always hit identical sequences.
    const agencyState = await loadAgencyState(
      targetAgencies.map((a) => a.subdomain),
      $,
    );
    const withScore = targetAgencies.map((a) => {
      const state = agencyState[a.subdomain];
      const score = state && state.priorityScore != null
        ? state.priorityScore
        : agencyScoring.defaultScoreFor(a.subdomain);
      return { ...a, _priorityScore: score };
    });
    const orderedAgencies = sortAndShuffle(withScore, shuffleAgencies);
    const freshnessMs = agencyFreshnessHours * 60 * 60 * 1000;
    summary.agenciesSkippedFresh = [];

    logger.info('Bonfire scrape: starting agency loop', {
      total: orderedAgencies.length,
      phase,
      shuffle: shuffleAgencies,
      freshnessHours: agencyFreshnessHours,
    });

    for (let idx = 0; idx < orderedAgencies.length; idx++) {
      const agency = orderedAgencies[idx];

      // Skip-if-recent: if this agency was successfully scraped within the
      // freshness window, don't re-hit the portal. We still iterate the loop
      // so the index/total log is accurate for observability.
      const state = agencyState[agency.subdomain];
      if (freshnessMs > 0 && state && state.lastScrapedAt) {
        const ageMs = Date.now() - new Date(state.lastScrapedAt).getTime();
        if (ageMs < freshnessMs) {
          summary.agenciesSkippedFresh.push({
            subdomain: agency.subdomain,
            ageHours: Math.round(ageMs / 3600000),
          });
          continue;
        }
      }

      summary.agenciesAttempted += 1;
      // Per-agency progress log — also keeps long SSH sessions from going
      // silent for 60+s (which can trigger client-side timeouts).
      logger.info('Bonfire scrape: agency', {
        index: idx + 1,
        total: orderedAgencies.length,
        subdomain: agency.subdomain,
      });
      await $.sleep(cfg.perAgencyDelayMs + Math.floor(Math.random() * 2000));

      const priorBlocks = (state && state.consecutiveBlocks) || 0;
      let portal;
      let outcome = {
        blocked: false,
        openCount: 0,
        reason: null,
        priorBlocks,
        priorAgency: state || null,
        highFitCount: 0,
      };
      try {
        portal = await $.openAgencyPortal(context, agency.subdomain);
      } catch (e) {
        summary.errors.push({ stage: 'portal', subdomain: agency.subdomain, reason: e.message });
        outcome.blocked = true;
        outcome.reason = e.message;
        await recordAgencyOutcome(agency, outcome, $);
        continue;
      }

      try {
        if (portal.blocked) {
          summary.agenciesBlocked.push({ subdomain: agency.subdomain, reason: portal.reason });
          outcome.blocked = true;
          outcome.reason = portal.reason;
          continue;
        }
        const result = await $.parseAgencyOpps(portal.page);
        if (result.blocked) {
          summary.agenciesBlocked.push({ subdomain: agency.subdomain, reason: 'parser-flagged' });
          outcome.blocked = true;
          outcome.reason = 'parser-flagged';
          continue;
        }

        const rows = result.records
          .map((r) => normalize.fromAgencyOpportunity(r, agency.subdomain, { agencyName: agency.name }))
          .filter(Boolean);

        outcome.openCount = rows.length;
        // Count rows that are likely to be high-fit. We don't have priority
        // scores yet at scrape time (enrichment happens later) — use volume
        // alone as a soft signal here, and the scoring fn will pick up the
        // sharper post-enrichment signal on subsequent runs via priorAgency.
        outcome.highFitCount = result.records.filter((r) => {
          const refLooksRecent = /^(20)?2[5-7]/i.test(String(r.refNumber || ''));
          return refLooksRecent;
        }).length;

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
        // Persist per-agency outcome regardless of success/failure so
        // skip-if-recent has a record for the next run.
        if (!dryRun) await recordAgencyOutcome(agency, outcome, $);
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

    await maybeAutoEnrich(summary, $, autoEnrich, dryRun);

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

// Shared by Phase A (early-return) and Phase B/C (post-loop) success paths.
// Runs the existing enrichAllUnenriched flow so the UI shows scored data
// without requiring an admin click. Failures are logged + recorded on the
// summary but never escalate the scrape itself.
async function maybeAutoEnrich(summary, $, autoEnrich, dryRun) {
  if (!autoEnrich || dryRun || summary.opportunitiesUpserted <= 0) return;
  try {
    // 500-row cap accommodates a full network scrape (92 agencies × ~5 Open
    // bids each ≈ 460 max). After first-day saturation, daily delta is small.
    // enrichAllUnenriched only picks rows with enrichedAt IS NULL, so cost
    // is bounded by genuinely-new opportunities, not total row count.
    const enrichResult = await $.enrichAll({ concurrency: 2, maxRows: 500 });
    summary.enrichment = {
      processed: enrichResult.processed,
      succeeded: enrichResult.succeeded,
      skipped: enrichResult.skipped,
      failed: enrichResult.failed,
    };
  } catch (e) {
    summary.errors.push({ stage: 'enrich', reason: e.message });
    logger.error('Bonfire auto-enrich failed', { error: e.message });
  }
}

module.exports = { runScrape, NETWORK_MIN_AGENCIES };
