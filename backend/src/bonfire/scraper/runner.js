// Phase A/B/C orchestration. Pure-ish: takes a context and a set of "deps"
// (parsers + service) so tests can mock them without launching a browser.
//
// Multi-account: when more than one account is configured via
// BONFIRE_SCRAPER_ACCOUNTS, we run an independent (browser, context) per
// account for the dashboard + network parse — that way AI-recommended cards
// (which are PER VENDOR ACCOUNT in Bonfire) get pulled from every account.
// We then build a UNION of unique agency subdomains across accounts and
// iterate each unique subdomain trying every account's authenticated session
// in turn. Bonfire opportunities can be invitation-only (private), so the
// same agency portal can show different open opps to different vendors —
// iterating all accounts surfaces those. The `external_id` upsert key
// (`bonfire:agency:<sub>:<ref>`) is account-agnostic, so cross-account
// duplicates dedup naturally at the DB layer.

const logger = require('../../logging/logger');
const service = require('../bonfire.service');
const { syncBonfireToOpportunities } = require('../bonfireSync.service');
const models = require('../../models');
const { getScraperConfig } = require('./config');
const { ensureLoggedIn, openAgencyPortal } = require('./session');
const browserMod = require('./browser');
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

// Union agencies across accounts by subdomain. The first observation wins
// for the `name` / `region` fields — accounts that see the same agency under
// slightly different display strings (rare but possible) reconcile to the
// first-seen labels. Logs deduped count for observability.
function unionAgenciesAcrossAccounts(perAccountAgencies) {
  const seen = new Map();
  let totalSeen = 0;
  for (const list of perAccountAgencies) {
    for (const a of list) {
      totalSeen += 1;
      const sub = a.subdomain;
      if (!sub) continue;
      if (!seen.has(sub)) seen.set(sub, a);
    }
  }
  return { agencies: [...seen.values()], totalSeen, unique: seen.size };
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
// - Login fails (signaled by ensureLoggedIn throwing) FOR ALL ACCOUNTS.
// - Vendor dashboard yields no records when phase >= A on every account.
// - Network parser yields fewer than NETWORK_MIN_AGENCIES across all accounts.
// - 100% of attempted agency portals are blocked for every account.
const NETWORK_MIN_AGENCIES = 10;

// Resolve the set of accounts to scrape with. Tests can inject deps.accounts;
// production reads from getScraperConfig().accounts. Falls back to a single
// implicit "default" account when legacy single-credential env is set.
function resolveAccountsToRun(opts, deps) {
  if (Array.isArray(deps.accounts) && deps.accounts.length) return deps.accounts;
  const cfg = getScraperConfig();
  if (cfg.accounts && cfg.accounts.length) return cfg.accounts;
  if (cfg.username && cfg.password) {
    return [{ label: 'default', username: cfg.username, password: cfg.password }];
  }
  return [];
}

// Per-account phase A: log in, parse the vendor dashboard, upsert AI-recommended
// cards, parse the My Network agency list. Returns { agencies, summaryDelta }.
async function runAccountDashboardAndNetwork(account, opts, deps, $) {
  const cfg = getScraperConfig();
  const summaryDelta = {
    label: account.label,
    counts: null,
    aiRecommendedFound: 0,
    aiRecommendedHref: null,
    networkAgenciesFound: 0,
    errors: [],
    opportunitiesUpserted: 0,
    opportunitiesInsertedNoId: 0,
  };

  let browser, context, agencies = [];
  try {
    browser = await $.launchBrowser();
    context = await $.createContext(browser, { label: account.label });
    await $.ensureLoggedIn(context, account);

    // Phase A — vendor hub dashboard (counts + AI-recommended cards).
    const dashboardPage = await context.newPage();
    try {
      await dashboardPage.goto(cfg.vendorHubUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
      await dashboardPage.waitForTimeout(4000);
      const dash = await $.parseDashboard(dashboardPage);
      summaryDelta.counts = dash.counts || {};
      summaryDelta.aiRecommendedFound = (dash.aiRecommended || []).length;
      summaryDelta.aiRecommendedHref = dash.aiRecommendedHref || null;

      const recRows = (dash.aiRecommended || [])
        .map((c) => normalize.fromVendorRecCard(c))
        .filter(Boolean);
      if (recRows.length && !opts.dryRun) {
        const out = await $.upsert(recRows);
        summaryDelta.opportunitiesUpserted += (out.upserted || 0);
        summaryDelta.opportunitiesInsertedNoId += (out.insertedWithoutExternalId || 0);
      }
    } finally {
      await dashboardPage.close().catch(() => {});
    }

    const phase = (opts.phase || cfg.phase || 'C').toUpperCase();
    if (phase === 'A') {
      // Phase A — no network parse. Caller closes context.
      summaryDelta.context = context;
      summaryDelta.browser = browser;
      return { agencies: [], summaryDelta };
    }

    // Phase B / C — agency network list.
    try {
      agencies = await $.parseNetwork(context, cfg.vendorNetworkUrl, {
        navTimeoutMs: cfg.navTimeoutMs,
        postNavWaitMs: 8000,
      });
      summaryDelta.networkAgenciesFound = agencies.length;
    } catch (e) {
      summaryDelta.errors.push({ stage: 'network', reason: e.message });
    }

    // Keep the context + browser ALIVE — the agency loop reuses this account's
    // authenticated session. The caller is responsible for closing both.
    summaryDelta.context = context;
    summaryDelta.browser = browser;
    return { agencies, summaryDelta };
  } catch (e) {
    summaryDelta.errors.push({ stage: 'account-init', reason: e.message });
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    summaryDelta.context = null;
    summaryDelta.browser = null;
    return { agencies: [], summaryDelta };
  }
}

async function runScrape(opts = {}, deps = {}) {
  const cfg = getScraperConfig();
  const phase = (opts.phase || cfg.phase || 'C').toUpperCase();
  const dryRun = !!opts.dryRun;
  const autoEnrich = opts.autoEnrich != null ? !!opts.autoEnrich : !!cfg.autoEnrich;
  const agencyFreshnessHours = opts.agencyFreshnessHours != null
    ? Number(opts.agencyFreshnessHours)
    : cfg.agencyFreshnessHours || 0;
  const shuffleAgencies = opts.shuffleAgencies != null
    ? !!opts.shuffleAgencies
    : !!cfg.shuffleAgencies;

  // Dependency injection. Tests pass in mocks; production uses the real modules.
  const $ = {
    launchBrowser: deps.launchBrowser || ((args) => browserMod.launchBrowser(args)),
    createContext: deps.createContext || ((b, args) => browserMod.createContext(b, args)),
    ensureLoggedIn: deps.ensureLoggedIn || ensureLoggedIn,
    openAgencyPortal: deps.openAgencyPortal || openAgencyPortal,
    parseDashboard: deps.parseDashboard || vendorDashboard.parse,
    parseNetwork: deps.parseNetwork || networkList.parse,
    parseAgencyOpps: deps.parseAgencyOpps || agencyOpportunities.parse,
    upsert: deps.upsert || service.upsertJsonArray,
    enrichAll: deps.enrichAll || service.enrichAllUnenriched,
    syncToOpportunities: deps.syncToOpportunities || syncBonfireToOpportunities,
    findAgencyState: deps.findAgencyState,
    upsertAgency: deps.upsertAgency,
    sleep: deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
  };

  const accounts = resolveAccountsToRun(opts, deps);
  if (!accounts.length) {
    throw new Error('Bonfire scrape: no accounts configured (set BONFIRE_SCRAPER_ACCOUNTS or BONFIRE_SCRAPER_USERNAME/PASSWORD)');
  }

  const summary = {
    phase,
    dryRun,
    startedAt: new Date().toISOString(),
    accounts: accounts.map((a) => a.label),
    perAccount: [],
    counts: null,
    aiRecommendedFound: 0,
    networkAgenciesFound: 0,
    agenciesAttempted: 0,
    agenciesBlocked: [],
    opportunitiesUpserted: 0,
    opportunitiesInsertedNoId: 0,
    errors: [],
  };

  // Hold every account's (browser, context) open through the agency loop so
  // we can iterate accounts per agency without re-launching browsers.
  const liveAccounts = [];
  try {
    // Step 1: per-account dashboard + network parse.
    for (const account of accounts) {
      logger.info('Bonfire scrape: starting account', { label: account.label, username: account.username });
      const { agencies, summaryDelta } = await runAccountDashboardAndNetwork(account, opts, deps, $);
      summary.perAccount.push({
        label: summaryDelta.label,
        counts: summaryDelta.counts,
        aiRecommendedFound: summaryDelta.aiRecommendedFound,
        aiRecommendedHref: summaryDelta.aiRecommendedHref,
        networkAgenciesFound: summaryDelta.networkAgenciesFound,
        opportunitiesUpserted: summaryDelta.opportunitiesUpserted,
        opportunitiesInsertedNoId: summaryDelta.opportunitiesInsertedNoId,
        errors: summaryDelta.errors,
      });
      summary.aiRecommendedFound += summaryDelta.aiRecommendedFound;
      summary.opportunitiesUpserted += summaryDelta.opportunitiesUpserted;
      summary.opportunitiesInsertedNoId += summaryDelta.opportunitiesInsertedNoId;
      if (!summary.counts && summaryDelta.counts) summary.counts = summaryDelta.counts;
      if (summaryDelta.errors.length) summary.errors.push(...summaryDelta.errors.map((e) => ({ ...e, account: account.label })));
      if (summaryDelta.context && summaryDelta.browser) {
        liveAccounts.push({
          account,
          browser: summaryDelta.browser,
          context: summaryDelta.context,
          agencies,
        });
      }
    }

    // Early escalation: if EVERY account failed init (e.g. all logins blocked
    // / credentials wrong / Cloudflare-at-login), the run is dead. Surface the
    // first account-init error verbatim so escalation messages stay readable.
    if (!liveAccounts.length) {
      const firstInitErr = summary.errors.find((e) => e.stage === 'account-init');
      const reason = firstInitErr ? firstInitErr.reason : 'all accounts failed to initialize';
      escalation.recordFailure(reason);
      summary.errors.push({ stage: 'top', reason });
      summary.escalated = true;
      summary.endedAt = new Date().toISOString();
      logger.error('Bonfire scrape: all accounts failed to initialize', { reason });
      return summary;
    }

    // Phase A early-return.
    if (phase === 'A') {
      escalation.recordSuccess();
      await maybeAutoEnrich(summary, $, autoEnrich, dryRun);
      summary.endedAt = new Date().toISOString();
      return summary;
    }

    // Step 2: union of agencies across accounts.
    const perAccountAgencies = liveAccounts.map((la) => la.agencies);
    const { agencies: unionedAgencies, totalSeen, unique } = unionAgenciesAcrossAccounts(perAccountAgencies);
    summary.networkAgenciesFound = unique;
    summary.networkAgenciesSeenAcrossAccounts = totalSeen;

    if (unionedAgencies.length < NETWORK_MIN_AGENCIES) {
      summary.errors.push({
        stage: 'network',
        reason: `union returned ${unionedAgencies.length} agencies; expected at least ${NETWORK_MIN_AGENCIES}`,
      });
    }

    // Apply allow-list with fallback. If set, iterate exactly those subdomains
    // regardless of whether the (sometimes-flaky) network parse surfaced them.
    let targetAgencies;
    const allowList = cfg.agencyAllowlist.length ? cfg.agencyAllowlist : (phase === 'B' ? ['dhantx'] : null);
    if (allowList) {
      targetAgencies = allowList.map((sub) => {
        const found = unionedAgencies.find((a) => a.subdomain === sub);
        return found || { subdomain: sub, name: sub };
      });
    } else {
      targetAgencies = unionedAgencies;
    }

    // Step 3: order by priority + load per-agency state.
    const agencyState = await loadAgencyState(targetAgencies.map((a) => a.subdomain), $);
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
      accounts: liveAccounts.length,
    });

    // Step 4: iterate each unique agency. For each, try every account in turn.
    // Aggregate openCount across accounts (different accounts may see different
    // invitation-only opps at the same portal); external_id dedup at upsert.
    for (let idx = 0; idx < orderedAgencies.length; idx++) {
      const agency = orderedAgencies[idx];

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
      logger.info('Bonfire scrape: agency', {
        index: idx + 1,
        total: orderedAgencies.length,
        subdomain: agency.subdomain,
      });

      const priorBlocks = (state && state.consecutiveBlocks) || 0;
      const outcome = {
        blocked: false,
        openCount: 0,
        reason: null,
        priorBlocks,
        priorAgency: state || null,
        highFitCount: 0,
      };
      // Tracks per-account result so block reporting is accurate ONLY when
      // every account failed at this agency.
      const accountResults = [];

      for (const la of liveAccounts) {
        await $.sleep(cfg.perAgencyDelayMs + Math.floor(Math.random() * 2000));
        let portal;
        try {
          portal = await $.openAgencyPortal(la.context, la.account, agency.subdomain);
        } catch (e) {
          accountResults.push({ account: la.account.label, blocked: true, reason: e.message });
          continue;
        }
        try {
          if (portal.blocked) {
            accountResults.push({ account: la.account.label, blocked: true, reason: portal.reason });
            continue;
          }
          const result = await $.parseAgencyOpps(portal.page);
          if (result.blocked) {
            accountResults.push({ account: la.account.label, blocked: true, reason: 'parser-flagged' });
            continue;
          }
          const rows = result.records
            .map((r) => normalize.fromAgencyOpportunity(r, agency.subdomain, { agencyName: agency.name }))
            .filter(Boolean);
          outcome.openCount += rows.length;
          outcome.highFitCount += result.records.filter((r) => {
            const refLooksRecent = /^(20)?2[5-7]/i.test(String(r.refNumber || ''));
            return refLooksRecent;
          }).length;
          if (rows.length && !dryRun) {
            const out = await $.upsert(rows);
            summary.opportunitiesUpserted += (out.upserted || 0);
            summary.opportunitiesInsertedNoId += (out.insertedWithoutExternalId || 0);
          }
          accountResults.push({ account: la.account.label, blocked: false, rowCount: rows.length });
        } catch (e) {
          const detail = (e.errors && Array.isArray(e.errors))
            ? e.errors.map((err) => `${err.path}: ${err.message}`).join('; ')
            : e.message;
          summary.errors.push({ stage: 'agency-parse', subdomain: agency.subdomain, account: la.account.label, reason: detail });
          accountResults.push({ account: la.account.label, blocked: true, reason: detail });
        } finally {
          if (portal && portal.page) await portal.page.close().catch(() => {});
        }
      }

      // Mark agency blocked only when EVERY account was blocked here.
      const allBlocked = accountResults.length > 0 && accountResults.every((r) => r.blocked);
      outcome.blocked = allBlocked;
      outcome.reason = allBlocked ? accountResults[0].reason : null;
      if (allBlocked) {
        summary.agenciesBlocked.push({
          subdomain: agency.subdomain,
          reason: accountResults.map((r) => `${r.account}: ${r.reason}`).join(' | '),
        });
      }
      if (!dryRun) await recordAgencyOutcome(agency, outcome, $);
    }

    // Fatal-failure heuristic: run was fatal only if NOTHING useful came in.
    const upsertedSomething = summary.opportunitiesUpserted > 0;
    const dashboardWorked = summary.counts && Object.keys(summary.counts).length > 0;
    const allAttemptedBlocked = summary.agenciesAttempted > 0
      && summary.agenciesBlocked.length === summary.agenciesAttempted;
    const fatal =
      (allAttemptedBlocked && !dashboardWorked)
      || (!upsertedSomething && !dashboardWorked);

    if (fatal) {
      const reason = allAttemptedBlocked
        ? '100% of attempted agency portals blocked across all accounts'
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
    for (const la of liveAccounts) {
      if (la.context) await la.context.close().catch(() => {});
      if (la.browser) await la.browser.close().catch(() => {});
    }
  }
}

// Shared by Phase A (early-return) and Phase B/C (post-loop) success paths.
async function maybeAutoEnrich(summary, $, autoEnrich, dryRun) {
  if (!autoEnrich || dryRun || summary.opportunitiesUpserted <= 0) return;
  try {
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
  try {
    const syncResult = await $.syncToOpportunities({});
    summary.opportunityTableSync = syncResult;
  } catch (e) {
    summary.errors.push({ stage: 'sync', reason: e.message });
    logger.error('Bonfire opportunity-table sync failed', { error: e.message });
  }
}

module.exports = {
  runScrape,
  unionAgenciesAcrossAccounts,
  resolveAccountsToRun,
  NETWORK_MIN_AGENCIES,
};
