// Unit tests for the SAM.gov adapter's retry/backoff hardening.
// Mocks global.fetch; no network or DB. Uses tiny backoff so tests run fast.
jest.mock('../../src/logging/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}));

const SamGovAdapter = require('../../src/ingestion/adapters/samGov.adapter');

const makeRes = (status, jsonBody = {}, { retryAfter = null } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => (String(h).toLowerCase() === 'retry-after' ? retryAfter : null) },
  json: async () => jsonBody,
  text: async () => JSON.stringify(jsonBody),
});

// maxRetries 3 => up to 4 attempts; near-zero backoff so the suite is fast.
const fastConfig = {
  config: {
    maxRetries: 3, backoffMs: 1, maxBackoffMs: 5, interPageDelayMs: 0,
    pageLimit: 2, keywords: ['ai'], naicsCode: '541511',
  },
};

describe('SamGovAdapter retry/backoff', () => {
  const OLD_KEY = process.env.SAM_GOV_API_KEY;
  beforeEach(() => { process.env.SAM_GOV_API_KEY = 'test-key'; });
  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.SAM_GOV_API_KEY;
    else process.env.SAM_GOV_API_KEY = OLD_KEY;
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test('returns [] and does not call fetch when no API key', async () => {
    process.env.SAM_GOV_API_KEY = '';
    const adapter = new SamGovAdapter({ config: {} });
    global.fetch = jest.fn();
    const out = await adapter.fetch();
    expect(out).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('retries on HTTP 429 then succeeds', async () => {
    const adapter = new SamGovAdapter(fastConfig);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(makeRes(429))
      .mockResolvedValueOnce(makeRes(200, { opportunitiesData: [{ noticeId: 'n1' }] }));
    const out = await adapter.fetch();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(1);
    expect(out[0].noticeId).toBe('n1');
  });

  test('retries on 5xx then succeeds', async () => {
    const adapter = new SamGovAdapter(fastConfig);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(makeRes(503))
      .mockResolvedValueOnce(makeRes(200, { opportunitiesData: [{ noticeId: 'n2' }] }));
    const out = await adapter.fetch();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(out[0].noticeId).toBe('n2');
  });

  test('throws after exhausting retries on persistent 429', async () => {
    const adapter = new SamGovAdapter(fastConfig); // 4 attempts total
    global.fetch = jest.fn().mockResolvedValue(makeRes(429));
    await expect(adapter.fetch()).rejects.toThrow(/429/);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  test('does NOT retry on 401 (bad key / client error)', async () => {
    const adapter = new SamGovAdapter(fastConfig);
    global.fetch = jest.fn().mockResolvedValue(makeRes(401, { error: 'invalid key' }));
    await expect(adapter.fetch()).rejects.toThrow(/401/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('honors Retry-After header for backoff timing', async () => {
    const adapter = new SamGovAdapter(fastConfig);
    const delay = adapter._retryDelayMs(1, '2');
    expect(delay).toBe(5); // 2s requested, capped at maxBackoffMs (5ms in fastConfig)
  });

  test('iterates one query per NAICS code and dedups by noticeId', async () => {
    // comma-separated NAICS must become two separate single-ncode queries
    const adapter = new SamGovAdapter({ config: { ...fastConfig.config, naicsCode: 'A,B' } });
    global.fetch = jest.fn()
      .mockResolvedValueOnce(makeRes(200, { opportunitiesData: [{ noticeId: 'x1' }, { noticeId: 'x2' }] })) // A p1 (==limit)
      .mockResolvedValueOnce(makeRes(200, { opportunitiesData: [] }))                                       // A p2 (end)
      .mockResolvedValueOnce(makeRes(200, { opportunitiesData: [{ noticeId: 'x2' }, { noticeId: 'x3' }] })) // B p1 (dup x2)
      .mockResolvedValueOnce(makeRes(200, { opportunitiesData: [] }));                                      // B p2 (end)
    const out = await adapter.fetch();
    expect(out.map((r) => r.noticeId).sort()).toEqual(['x1', 'x2', 'x3']);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});
