// v9.10: Source Health Auto-Triage Agent — classifier + retry + email gating.

jest.mock('../../src/ingestion/ingestion.service', () => ({
  runIngestion: jest.fn(),
}));
jest.mock('../../src/utils/email', () => ({
  sendEmail: jest.fn(async () => ({ success: true, messageId: 'test' })),
}));
jest.mock('../../src/admin/dataSourceHealth.controller', () => ({
  // The agent calls getDataSourcesHealth via a fake-res adapter.
  // We expose a setter so each test can stage the snapshot it wants.
  __setSnapshot: () => {},
  getDataSourcesHealth: async (req, res) => {
    res.status(200).json({ status: 'success', data: global.__healthSnapshot });
  },
}));
// v0.7 expiry alerts — keep the mock returning [] by default so existing
// tests stay focused on retry/classify/email behavior. Dedicated tests
// override.
jest.mock('../../src/documents/document.service', () => ({
  listDocuments: jest.fn(async () => []),
}));

const ingestion = require('../../src/ingestion/ingestion.service');
const email = require('../../src/utils/email');
const agent = require('../../src/admin/sourceHealthAgent.service');

describe('sourceHealthAgent.classifyError', () => {
  const cases = [
    ['Adzuna adapter requires ADZUNA_APP_ID and ADZUNA_APP_KEY', 'missing_credentials'],
    ['USAJobs adapter requires USAJOBS_API_KEY', 'missing_credentials'],
    ['value too long for type character varying(255)', 'schema_overflow'],
    ['Jobicy API returned 400: tag length validation', 'upstream_validation'],
    ['SAM.gov API request timed out after 30000ms', 'upstream_unavailable'],
    ['ECONNRESET socket hang up', 'upstream_unavailable'],
    ['feed returned 503 Service Unavailable', 'upstream_unavailable'],
    ['Status code 404 for techcrunch fundraise feed', 'feed_url_dead'],
    ['Some weird non-matching message', 'unknown'],
    [null, 'unknown'],
    ['', 'unknown'],
  ];
  it.each(cases)('classifies %s as %s', (msg, expected) => {
    expect(agent.classifyError(msg).category).toBe(expected);
  });
});

describe('sourceHealthAgent.runAgent', () => {
  beforeEach(() => {
    ingestion.runIngestion.mockReset();
    email.sendEmail.mockClear();
  });

  function snapshot({ failing = [], zeroYield = [], healthy = [] } = {}) {
    return {
      summary: { healthy: healthy.length, stale: 0, zero_yield: zeroYield.length, failing: failing.length, disabled: 0 },
      sources: [
        ...failing.map((f) => ({ status: 'failing', last_run_error: f.err, channel: { label: 'X', key: 'x' }, ...f })),
        ...zeroYield.map((z) => ({ status: 'zero_yield', last_run_error: null, channel: { label: 'X', key: 'x' }, consecutive_zero_runs: 3, ...z })),
        ...healthy.map((h) => ({ status: 'healthy', last_run_error: null, channel: { label: 'X', key: 'x' }, ...h })),
      ],
    };
  }

  it('returns should_email=false on a clean snapshot (no email)', async () => {
    global.__healthSnapshot = snapshot({ healthy: [{ name: 'alpha' }] });
    const r = await agent.runAgent({ retry: true });
    expect(r.should_email).toBe(false);
    expect(r.recovered).toEqual([]);
    expect(r.still_failing).toEqual([]);
  });

  it('retries each failing source exactly once', async () => {
    let snap = snapshot({ failing: [
      { name: 'a', err: 'timeout' },
      { name: 'b', err: 'API_KEY missing' },
    ] });
    global.__healthSnapshot = snap;
    ingestion.runIngestion.mockImplementation(async (name) => {
      // Make 'a' recover, 'b' stay broken.
      if (name === 'a') {
        snap = snapshot({ healthy: [{ name: 'a' }], failing: [{ name: 'b', err: 'API_KEY missing' }] });
        global.__healthSnapshot = snap;
        return { status: 'success', recordsCreated: 5 };
      }
      return { status: 'failed', recordsCreated: 0 };
    });
    const r = await agent.runAgent({ retry: true });
    expect(ingestion.runIngestion).toHaveBeenCalledTimes(2);
    expect(r.recovered).toEqual(['a']);
    expect(r.still_failing.map((s) => s.name)).toEqual(['b']);
    expect(r.still_failing[0].category).toBe('missing_credentials');
    expect(r.should_email).toBe(true);
  });

  it('does not retry zero_yield sources (those are manual review)', async () => {
    global.__healthSnapshot = snapshot({ zeroYield: [{ name: 'dried' }] });
    const r = await agent.runAgent({ retry: true });
    expect(ingestion.runIngestion).not.toHaveBeenCalled();
    expect(r.zero_yield).toHaveLength(1);
    expect(r.zero_yield[0].category).toBe('source_dried_up');
    expect(r.should_email).toBe(true);
  });
});

describe('sourceHealthAgent.runAgent — vault doc expiry alerts (v0.7)', () => {
  beforeEach(() => {
    ingestion.runIngestion.mockReset();
    email.sendEmail.mockClear();
    const docSvc = require('../../src/documents/document.service');
    docSvc.listDocuments.mockReset().mockResolvedValue([]);
  });

  function snapshot() {
    return {
      summary: { healthy: 1, stale: 0, zero_yield: 0, failing: 0, disabled: 0 },
      sources: [{ status: 'healthy', name: 'devto', channel: { label: 'X', key: 'x' } }],
    };
  }

  it('flags expired docs in the report and triggers email', async () => {
    global.__healthSnapshot = snapshot();
    const docSvc = require('../../src/documents/document.service');
    const expired = new Date(Date.now() - 5 * 86_400_000); // 5 days ago
    docSvc.listDocuments.mockResolvedValue([
      { id: 'd1', type: 'coi', name: 'COI 2025', version: 1, scope: 'global', expiresAt: expired },
    ]);
    const r = await agent.runAgent({ retry: false });
    expect(r.expired_docs).toHaveLength(1);
    expect(r.expired_docs[0].days_until_expiry).toBeLessThan(0);
    expect(r.expiring_docs).toEqual([]);
    expect(r.should_email).toBe(true);
  });

  it('flags expiring-soon docs (within 30d) separately from already-expired', async () => {
    global.__healthSnapshot = snapshot();
    const docSvc = require('../../src/documents/document.service');
    const soon = new Date(Date.now() + 12 * 86_400_000); // 12d
    docSvc.listDocuments.mockResolvedValue([
      { id: 'd2', type: 'cert_8a', name: '8(a) Cert', version: 2, scope: 'global', expiresAt: soon },
    ]);
    const r = await agent.runAgent({ retry: false });
    expect(r.expiring_docs).toHaveLength(1);
    expect(r.expiring_docs[0].days_until_expiry).toBeGreaterThanOrEqual(11);
    expect(r.expired_docs).toEqual([]);
    expect(r.should_email).toBe(true);
  });

  it('keeps should_email=false when nothing is expired/expiring + nothing else changed', async () => {
    global.__healthSnapshot = snapshot();
    const r = await agent.runAgent({ retry: false });
    expect(r.expired_docs).toEqual([]);
    expect(r.expiring_docs).toEqual([]);
    expect(r.should_email).toBe(false);
  });

  it('email body includes the Expired and Expiring sections when present', async () => {
    process.env.OIED_SOURCE_HEALTH_AGENT_TO = 'ali@example.com';
    const out = await agent.emailReport({
      should_email: true,
      recovered: [], still_failing: [], zero_yield: [],
      expired_docs: [
        { id: 'd1', type: 'coi', type_label: 'Certificate of Insurance (COI)',
          name: 'COI 2025', version: 1, scope: 'global', days_until_expiry: -5 },
      ],
      expiring_docs: [
        { id: 'd2', type: 'cert_8a', type_label: '8(a) Certification',
          name: '8(a) Cert', version: 2, scope: 'global', days_until_expiry: 12 },
      ],
      summary_after: { healthy: 1, failing: 0, zero_yield: 0, disabled: 0, stale: 0 },
    });
    expect(out.sent).toBe(true);
    const call = email.sendEmail.mock.calls[email.sendEmail.mock.calls.length - 1][0];
    expect(call.html).toMatch(/Expired vault documents/);
    expect(call.html).toMatch(/COI 2025/);
    expect(call.html).toMatch(/expiring soon/i);
    expect(call.text).toMatch(/EXPIRED vault docs/);
    expect(call.text).toMatch(/expires in 12d/);
  });
});

describe('sourceHealthAgent.emailReport', () => {
  beforeEach(() => {
    email.sendEmail.mockClear();
    process.env.OIED_SOURCE_HEALTH_AGENT_TO = 'ali@example.com';
  });

  it('skips email when nothing to report', async () => {
    const out = await agent.emailReport({ should_email: false, recovered: [], still_failing: [], zero_yield: [] });
    expect(out.sent).toBe(false);
    expect(out.reason).toBe('nothing_to_report');
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('skips when no recipient is configured', async () => {
    delete process.env.OIED_SOURCE_HEALTH_AGENT_TO;
    delete process.env.OIED_BRIEFING_TO;
    const out = await agent.emailReport({
      should_email: true, recovered: ['a'], still_failing: [], zero_yield: [],
    });
    expect(out.sent).toBe(false);
    expect(out.reason).toBe('no_recipient');
  });

  it('sends the email when there is content + recipient', async () => {
    const out = await agent.emailReport({
      should_email: true, recovered: ['a'], still_failing: [], zero_yield: [],
      summary_after: { healthy: 5, failing: 0, zero_yield: 0, disabled: 0, stale: 0 },
    });
    expect(out.sent).toBe(true);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const call = email.sendEmail.mock.calls[0][0];
    expect(call.to).toBe('ali@example.com');
    expect(call.subject).toMatch(/auto-recovered/);
    expect(call.html).toMatch(/Auto-Triage/);
  });
});
