// Runner orchestration test. Mocks every external dependency so this runs
// without Playwright, without a database, and without Cloudflare risk.

// Mock the service module that runner.js requires at the top level.
jest.mock('../../../src/bonfire/bonfire.service', () => ({
  upsertJsonArray: jest.fn(),
  enrichAllUnenriched: jest.fn().mockResolvedValue({
    processed: 0, succeeded: 0, skipped: 0, failed: 0, results: [],
  }),
}));
// Sync to unified opportunities table — mocked because tests don't exercise
// the Opportunity model.
jest.mock('../../../src/bonfire/bonfireSync.service', () => ({
  syncBonfireToOpportunities: jest.fn().mockResolvedValue({
    processed: 0, upserted: 0, skipped: 0, errors: 0,
  }),
}));
// Mock models so the runner's lazy BonfireAgency lookup doesn't try to
// connect to Postgres in unit tests.
jest.mock('../../../src/models', () => ({
  sequelize: {},
  BonfireAgency: {
    findAll: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue([{}, true]),
  },
}));
// Mock escalation so failure-counter writes don't touch the filesystem.
jest.mock('../../../src/bonfire/scraper/escalation', () => ({
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
}));

// Mock the env config to avoid pulling .env values into the test harness.
jest.mock('../../../src/bonfire/scraper/config', () => ({
  getScraperConfig: () => ({
    enabled: true,
    cronEnabled: false,
    headless: true,
    username: 'u',
    password: 'p',
    phase: 'C',
    agencyAllowlist: [],
    storageDir: '/tmp/.test-bonfire',
    sessionTtlMin: 25,
    perAgencyDelayMs: 1, // fast tests
    autoEnrich: false,   // unit tests don't exercise enrichment path by default
    agencyFreshnessHours: 0, // disabled by default in tests
    shuffleAgencies: false,  // deterministic order by default in tests
    loginUrl: 'https://account.bonfirehub.com/login',
    dashboardUrl: 'https://account.bonfirehub.com/settings/dashboard',
    vendorHubUrl: 'https://vendor.bonfirehub.com/',
    vendorNetworkUrl: 'https://vendor.bonfirehub.com/network',
    userAgent: 'test',
    viewport: { width: 1280, height: 900 },
    navTimeoutMs: 1000,
    defaultJitterMaxMs: 0,
  }),
  isScraperEnabled: () => true,
}));

const { runScrape } = require('../../../src/bonfire/scraper/runner');
const service = require('../../../src/bonfire/bonfire.service');
const escalation = require('../../../src/bonfire/scraper/escalation');

// Build a minimal "page" stub: goto + waitForTimeout + close are all the runner uses.
function makePage() {
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    content: jest.fn().mockResolvedValue('<html></html>'),
    title: jest.fn().mockResolvedValue(''),
    url: jest.fn().mockReturnValue('https://account.bonfirehub.com/settings/dashboard'),
  };
}

function makeContext() {
  return {
    newPage: jest.fn().mockImplementation(async () => makePage()),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeBrowser(context) {
  return {
    newContext: jest.fn().mockResolvedValue(context),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reflect realistic behavior: when called with N rows, claim N upserted.
  service.upsertJsonArray.mockImplementation(async (rows = []) => ({
    upserted: rows.length,
    insertedWithoutExternalId: 0,
    errors: [],
  }));
});

describe('runner.runScrape', () => {
  it('Phase A: parses dashboard, calls upsert with rec-card rows, records success', async () => {
    const context = makeContext();
    const browser = makeBrowser(context);

    const summary = await runScrape({ phase: 'A' }, {
      launchBrowser: jest.fn().mockResolvedValue(browser),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({
        counts: { invitations: 270 },
        aiRecommended: [
          { title: 'Card A', agency: 'Agency A', description: 'desc' },
          { title: 'Card B', agency: 'Agency B', description: 'desc2' },
        ],
      }),
      sleep: () => Promise.resolve(),
    });

    expect(service.upsertJsonArray).toHaveBeenCalledTimes(1);
    const upsertedRows = service.upsertJsonArray.mock.calls[0][0];
    expect(upsertedRows).toHaveLength(2);
    expect(upsertedRows[0].external_id).toMatch(/^bonfire:vendor-rec:/);
    expect(summary.phase).toBe('A');
    expect(summary.aiRecommendedFound).toBe(2);
    expect(escalation.recordSuccess).toHaveBeenCalled();
    expect(escalation.recordFailure).not.toHaveBeenCalled();
  });

  it('Phase A: dryRun does NOT call upsert', async () => {
    const context = makeContext();
    await runScrape({ phase: 'A', dryRun: true }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({
        counts: {},
        aiRecommended: [{ title: 'X', agency: 'Y' }],
      }),
      sleep: () => Promise.resolve(),
    });
    expect(service.upsertJsonArray).not.toHaveBeenCalled();
  });

  it('Phase C: iterates network agencies, skips blocked ones, upserts unblocked', async () => {
    const context = makeContext();

    // Build a 12-agency list: 4 are "blocked", 8 succeed. Above the 10-agency
    // network-min so the run is NOT flagged fatal.
    const agencies = Array.from({ length: 12 }, (_, i) => ({
      subdomain: i % 3 === 0 ? `blocked${i}` : `good${i}`,
      name: `Agency ${i}`,
    }));
    const blockedCount = agencies.filter((a) => a.subdomain.startsWith('blocked')).length;
    const goodCount = agencies.length - blockedCount;

    const summary = await runScrape({ phase: 'C' }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({
        counts: {},
        aiRecommended: [{ title: 'C', agency: 'A' }],
      }),
      parseNetwork: jest.fn().mockResolvedValue(agencies),
      openAgencyPortal: jest.fn().mockImplementation(async (_ctx, sub) => {
        if (sub.startsWith('blocked')) return { page: makePage(), blocked: true, reason: 'cloudflare' };
        return { page: makePage(), blocked: false };
      }),
      parseAgencyOpps: jest.fn().mockImplementation(async () => ({
        records: [{ refNumber: 'RFP-1', projectName: 'P1', status: 'Open' }],
        blocked: false,
      })),
      sleep: () => Promise.resolve(),
    });

    expect(summary.agenciesAttempted).toBe(agencies.length);
    expect(summary.agenciesBlocked).toHaveLength(blockedCount);
    // 1 dashboard upsert + N unblocked agency upserts
    expect(service.upsertJsonArray).toHaveBeenCalledTimes(1 + goodCount);
    expect(escalation.recordSuccess).toHaveBeenCalled();
  });

  it('escalates when 100% of attempted agency portals are blocked', async () => {
    const context = makeContext();
    await runScrape({ phase: 'C' }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({
        counts: {},
        aiRecommended: [{ title: 'C', agency: 'A' }],
      }),
      parseNetwork: jest.fn().mockResolvedValue(
        // Need >= NETWORK_MIN_AGENCIES (10) so the network check itself doesn't fail.
        Array.from({ length: 10 }, (_, i) => ({ subdomain: `s${i}`, name: `s${i}` })),
      ),
      openAgencyPortal: jest.fn().mockResolvedValue({ page: makePage(), blocked: true, reason: 'cf' }),
      parseAgencyOpps: jest.fn(),
      sleep: () => Promise.resolve(),
    });
    expect(escalation.recordFailure).toHaveBeenCalled();
    expect(escalation.recordFailure.mock.calls[0][0]).toMatch(/100%/);
  });

  it('escalates only when nothing useful came in (no upserts AND no dashboard counts)', async () => {
    const context = makeContext();
    await runScrape({ phase: 'C' }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({
        counts: {}, // dashboard parse failed completely
        aiRecommended: [], // and no inline cards
      }),
      parseNetwork: jest.fn().mockResolvedValue([]),
      openAgencyPortal: jest.fn(),
      parseAgencyOpps: jest.fn(),
      sleep: () => Promise.resolve(),
    });
    expect(escalation.recordFailure).toHaveBeenCalled();
  });

  it('does NOT escalate when dashboard counts came in even if network is broken', async () => {
    const context = makeContext();
    const summary = await runScrape({ phase: 'C' }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({
        counts: { invitations: 271 }, // dashboard worked
        aiRecommended: [],
      }),
      parseNetwork: jest.fn().mockResolvedValue([]), // network broken
      openAgencyPortal: jest.fn(),
      parseAgencyOpps: jest.fn(),
      sleep: () => Promise.resolve(),
    });
    expect(escalation.recordSuccess).toHaveBeenCalled();
    expect(escalation.recordFailure).not.toHaveBeenCalled();
    expect(summary.escalated).toBeFalsy();
  });

  it('auto-enriches after a successful scrape when autoEnrich is on', async () => {
    const context = makeContext();
    const enrichSpy = jest.fn().mockResolvedValue({
      processed: 2, succeeded: 2, skipped: 0, failed: 0, results: [],
    });
    const summary = await runScrape({ phase: 'A', autoEnrich: true }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({
        counts: { invitations: 100 },
        aiRecommended: [{ title: 'C', agency: 'A' }],
      }),
      enrichAll: enrichSpy,
      sleep: () => Promise.resolve(),
    });
    expect(enrichSpy).toHaveBeenCalledTimes(1);
    expect(summary.enrichment).toEqual({
      processed: 2, succeeded: 2, skipped: 0, failed: 0,
    });
  });

  it('does NOT call enrichAll on dryRun even when autoEnrich is on', async () => {
    const context = makeContext();
    const enrichSpy = jest.fn();
    await runScrape({ phase: 'A', dryRun: true, autoEnrich: true }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({
        counts: {}, aiRecommended: [{ title: 'C', agency: 'A' }],
      }),
      enrichAll: enrichSpy,
      sleep: () => Promise.resolve(),
    });
    expect(enrichSpy).not.toHaveBeenCalled();
  });

  it('skip-if-recent: agencies scraped within freshness window are not visited', async () => {
    const context = makeContext();
    const recentTs = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    const findAgencyState = jest.fn().mockResolvedValue([
      { subdomain: 'fresh-a', lastScrapedAt: recentTs, consecutiveBlocks: 0 },
      { subdomain: 'fresh-b', lastScrapedAt: recentTs, consecutiveBlocks: 0 },
      // 'stale-c' has no row -> never scraped, should run
    ]);
    const openSpy = jest.fn().mockResolvedValue({ page: makePage(), blocked: false });
    const parseSpy = jest.fn().mockResolvedValue({ records: [], blocked: false });
    const upsertSpy = jest.fn();

    const summary = await runScrape({ phase: 'C', agencyFreshnessHours: 72 }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({ counts: {}, aiRecommended: [] }),
      parseNetwork: jest.fn().mockResolvedValue([
        { subdomain: 'fresh-a', name: 'A' },
        { subdomain: 'fresh-b', name: 'B' },
        { subdomain: 'stale-c', name: 'C' },
      ]),
      openAgencyPortal: openSpy,
      parseAgencyOpps: parseSpy,
      upsert: upsertSpy,
      findAgencyState,
      upsertAgency: jest.fn(),
      sleep: () => Promise.resolve(),
    });

    expect(summary.agenciesAttempted).toBe(1); // only stale-c
    expect(summary.agenciesSkippedFresh).toHaveLength(2);
    expect(summary.agenciesSkippedFresh.map((a) => a.subdomain).sort()).toEqual(['fresh-a', 'fresh-b']);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][1]).toBe('stale-c');
  });

  it('persists per-agency outcome via upsertAgency dep', async () => {
    const context = makeContext();
    const upsertAgencySpy = jest.fn();
    await runScrape({ phase: 'C' }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockResolvedValue(undefined),
      parseDashboard: jest.fn().mockResolvedValue({ counts: {}, aiRecommended: [] }),
      parseNetwork: jest.fn().mockResolvedValue([{ subdomain: 'a', name: 'A' }]),
      openAgencyPortal: jest.fn().mockResolvedValue({ page: makePage(), blocked: false }),
      parseAgencyOpps: jest.fn().mockResolvedValue({
        records: [{ refNumber: 'R1', projectName: 'P1', status: 'Open' }],
        blocked: false,
      }),
      findAgencyState: jest.fn().mockResolvedValue([]),
      upsertAgency: upsertAgencySpy,
      sleep: () => Promise.resolve(),
    });
    expect(upsertAgencySpy).toHaveBeenCalledTimes(1);
    const persisted = upsertAgencySpy.mock.calls[0][0];
    expect(persisted.subdomain).toBe('a');
    expect(persisted.lastScrapedAt).toBeInstanceOf(Date);
    expect(persisted.lastSucceededAt).toBeInstanceOf(Date);
    expect(persisted.lastOpenCount).toBe(1);
    expect(persisted.consecutiveBlocks).toBe(0);
  });

  it('escalates and surfaces error when ensureLoggedIn throws', async () => {
    const context = makeContext();
    const summary = await runScrape({ phase: 'A' }, {
      launchBrowser: jest.fn().mockResolvedValue(makeBrowser(context)),
      createContext: jest.fn().mockResolvedValue(context),
      ensureLoggedIn: jest.fn().mockRejectedValue(new Error('login intercepted')),
      sleep: () => Promise.resolve(),
    });
    expect(summary.escalated).toBe(true);
    expect(summary.errors[0].stage).toBe('top');
    expect(escalation.recordFailure).toHaveBeenCalledWith('login intercepted');
  });
});
