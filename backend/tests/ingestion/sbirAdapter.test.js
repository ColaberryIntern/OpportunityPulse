// Unit tests for the revived SBIR.gov adapter (multi-keyword + retry + scoring stamps).
// Mocks global.fetch; no network. The live API is flaky, so the transform/retry/dedup
// logic is what we verify here.
jest.mock('../../src/logging/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
const SbirAdapter = require('../../src/ingestion/adapters/sbir.adapter');

const ok = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
const code = (s) => ({ ok: false, status: s, headers: { get: () => null }, json: async () => ({}), text: async () => '' });
const fastCfg = { config: { keywords: ['ai', 'data'], rows: 10, maxRetries: 3, backoffMs: 1, maxBackoffMs: 5, interCallDelayMs: 0 } };

describe('SbirAdapter transform', () => {
  test('stamps the fields the gov scorer + SBIR boost read', () => {
    const a = new SbirAdapter({ config: {} });
    const out = a.transform([{
      solicitation_number: 'S1', solicitation_title: 'AI for Learning', program: 'SBIR',
      agency: 'NSF', close_date: '2026-09-30', abstract: 'desc',
    }]);
    expect(out[0].source).toBe('sbir_gov');
    expect(out[0].type).toBe('gov_contract');
    expect(out[0].sourceId).toBe('S1');
    expect(out[0].sourceData.typeOfSetAside).toBe('SBIR');
    expect(out[0].sourceData.naicsCode).toBe('541715');
    expect(out[0].sourceData.fullParentPathName).toBe('NSF');
    expect(out[0].expiresAt).toBeInstanceOf(Date);
  });
  test('detects STTR program', () => {
    const a = new SbirAdapter({ config: {} });
    const out = a.transform([{ solicitation_number: 'S2', solicitation_title: 'x', program: 'STTR Phase I', agency: 'NIH' }]);
    expect(out[0].sourceData.typeOfSetAside).toBe('STTR');
  });
});

describe('SbirAdapter fetch', () => {
  afterEach(() => { delete global.fetch; jest.restoreAllMocks(); });

  test('iterates keywords, retries 429, dedups by solicitation_number', async () => {
    const a = new SbirAdapter(fastCfg);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(code(429)) // kw "ai" attempt 1
      .mockResolvedValueOnce(ok([{ solicitation_number: 'A' }, { solicitation_number: 'B' }])) // kw "ai" attempt 2
      .mockResolvedValueOnce(ok([{ solicitation_number: 'B' }, { solicitation_number: 'C' }])); // kw "data"
    const out = await a.fetch();
    expect(out.map((r) => r.solicitation_number).sort()).toEqual(['A', 'B', 'C']);
  });

  test('partial failure still returns the successful keyword results', async () => {
    const a = new SbirAdapter(fastCfg);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(ok([{ solicitation_number: 'A' }])) // "ai" ok
      .mockResolvedValue(code(500)); // "data" fails through retries
    const out = await a.fetch();
    expect(out.map((r) => r.solicitation_number)).toEqual(['A']);
  });

  test('total outage (every keyword fails) throws so the run is marked failed', async () => {
    const a = new SbirAdapter({ config: { keywords: ['ai'], maxRetries: 1, backoffMs: 1, maxBackoffMs: 2, interCallDelayMs: 0 } });
    global.fetch = jest.fn().mockResolvedValue(code(429));
    await expect(a.fetch()).rejects.toThrow(/429|SBIR/);
  });

  // Server-side outage signature ("not available at this time") — degrade fast.
  const outage = (s) => ({
    ok: false, status: s, headers: { get: () => null }, json: async () => ({}),
    text: async () => JSON.stringify({ Code: 'TooManyRequestsError', Message: 'The SBIR Public API is not available at this time.' }),
  });

  test('known upstream outage: aborts on the first keyword and returns [] (no storm, no hard failure)', async () => {
    const a = new SbirAdapter(fastCfg); // 2 keywords, maxRetries 3
    global.fetch = jest.fn().mockResolvedValue(outage(429));
    const out = await a.fetch();
    expect(out).toEqual([]); // graceful skip, not a thrown failure
    expect(global.fetch).toHaveBeenCalledTimes(1); // first keyword only, no retries, no 2nd keyword
  });

  test('treats a 403 with the outage body the same as the 429 outage', async () => {
    const a = new SbirAdapter(fastCfg);
    global.fetch = jest.fn().mockResolvedValue(outage(403));
    const out = await a.fetch();
    expect(out).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
