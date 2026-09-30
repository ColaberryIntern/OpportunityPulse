// bonfire.service.listBestFitOpportunities — digest-parity endpoint.
//
// The whole point of this function is that it does NOT reimplement the
// ranking: it delegates to richDigest.topBonfire, the same function the daily
// "Your Opportunity Pulse" email calls. So the contract under test is
// "delegates correctly, clamps the limit, reports the real thresholds" —
// NOT "ranks correctly" (that belongs to the digest's own tests). A test that
// asserted ordering here would just re-test the digest and would pass even if
// the delegation were replaced by a divergent copy.

jest.mock('../../src/models', () => ({
  BonfireOpportunity: {},
  BonfireOpportunityTag: {},
  BonfireStrategicOpportunity: {},
  sequelize: { literal: (s) => s },
}));

jest.mock('../../src/emailDigest/richDigest.service', () => ({
  topBonfire: jest.fn(async (limit) => Array.from({ length: limit }, (_, i) => ({ id: `row-${i}` }))),
  BONFIRE_DIGEST_MIN_CLOSE_DAYS: 10,
  HIDDEN_VERDICTS: ['no_bid', 'needs_review'],
  BONFIRE_DOMAIN_RE: 'software|analytic',
}));

const richDigest = require('../../src/emailDigest/richDigest.service');
const svc = require('../../src/bonfire/bonfire.service');

beforeEach(() => {
  richDigest.topBonfire.mockClear();
});

function lastLimit() {
  return richDigest.topBonfire.mock.calls.at(-1)?.[0];
}

describe('listBestFitOpportunities — delegation (parity guarantee)', () => {
  it('calls richDigest.topBonfire exactly once', async () => {
    await svc.listBestFitOpportunities({ limit: 10 });
    expect(richDigest.topBonfire).toHaveBeenCalledTimes(1);
  });

  it('returns the digest rows untouched — no re-sorting on our side', async () => {
    richDigest.topBonfire.mockResolvedValueOnce([{ id: 'b' }, { id: 'a' }, { id: 'c' }]);
    const { rows } = await svc.listBestFitOpportunities({ limit: 3 });
    // Deliberately NOT alphabetical: the digest's order must survive verbatim.
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('reports the thresholds actually applied, read from the digest module', async () => {
    const { ranking } = await svc.listBestFitOpportunities({});
    expect(ranking.parityWith).toBe('daily_digest.topBonfire');
    expect(ranking.minCloseDays).toBe(10);
    expect(ranking.demotedVerdictStatuses).toEqual(['no_bid', 'needs_review']);
    expect(Array.isArray(ranking.sort)).toBe(true);
  });

  it('threshold metadata tracks the digest rather than being hardcoded', async () => {
    // Simulate BONFIRE_DIGEST_MIN_CLOSE_DAYS being retuned via env in prod.
    const original = richDigest.BONFIRE_DIGEST_MIN_CLOSE_DAYS;
    richDigest.BONFIRE_DIGEST_MIN_CLOSE_DAYS = 21;
    try {
      const { ranking } = await svc.listBestFitOpportunities({});
      expect(ranking.minCloseDays).toBe(21);
    } finally {
      richDigest.BONFIRE_DIGEST_MIN_CLOSE_DAYS = original;
    }
  });
});

describe('listBestFitOpportunities — limit handling (boundaries)', () => {
  it('defaults to 10, matching the digest section size (TOP.bonfire)', async () => {
    await svc.listBestFitOpportunities({});
    expect(lastLimit()).toBe(10);
  });

  it('defaults to 10 when called with no argument at all', async () => {
    await svc.listBestFitOpportunities();
    expect(lastLimit()).toBe(10);
  });

  it('honors an explicit in-range limit', async () => {
    await svc.listBestFitOpportunities({ limit: 25 });
    expect(lastLimit()).toBe(25);
  });

  it('accepts a numeric string (query params arrive as strings)', async () => {
    await svc.listBestFitOpportunities({ limit: '7' });
    expect(lastLimit()).toBe(7);
  });

  it('clamps above the 50 ceiling', async () => {
    await svc.listBestFitOpportunities({ limit: 5000 });
    expect(lastLimit()).toBe(50);
  });

  it('accepts exactly the ceiling', async () => {
    await svc.listBestFitOpportunities({ limit: 50 });
    expect(lastLimit()).toBe(50);
  });

  it('accepts exactly the floor', async () => {
    await svc.listBestFitOpportunities({ limit: 1 });
    expect(lastLimit()).toBe(1);
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['non-numeric', 'abc'],
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('falls back to the default for %s rather than passing it through', async (_label, limit) => {
    await svc.listBestFitOpportunities({ limit });
    expect(lastLimit()).toBe(10);
  });

  it('floors a fractional limit to an integer', async () => {
    await svc.listBestFitOpportunities({ limit: 12.9 });
    expect(lastLimit()).toBe(12);
  });

  it('never passes a limit outside [1, 50] for hostile input', async () => {
    for (const limit of [-1e9, 0, 0.4, '1e9', 1e9, '  ', {}, []]) {
      // eslint-disable-next-line no-await-in-loop
      await svc.listBestFitOpportunities({ limit });
      const applied = lastLimit();
      expect(Number.isInteger(applied)).toBe(true);
      expect(applied).toBeGreaterThanOrEqual(1);
      expect(applied).toBeLessThanOrEqual(50);
    }
  });
});

describe('listBestFitOpportunities — failure path', () => {
  it('propagates a DB failure so the controller can map it to a 500', async () => {
    richDigest.topBonfire.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(svc.listBestFitOpportunities({ limit: 10 }))
      .rejects.toThrow('connection terminated');
  });

  it('does not swallow the error into an empty-but-successful result', async () => {
    richDigest.topBonfire.mockRejectedValueOnce(new Error('boom'));
    // A silent [] here would render an empty "Top 10" page that looks like
    // "no opportunities" rather than "the upstream is down" — see CLAUDE.md
    // Failure-First Design: silent failure is a defect.
    let settled = null;
    await svc.listBestFitOpportunities({}).then(
      (v) => { settled = { ok: true, v }; },
      (e) => { settled = { ok: false, e }; },
    );
    expect(settled.ok).toBe(false);
  });
});

describe('listBestFitOpportunities — replayability', () => {
  it('is read-only: repeated calls produce identical output and no extra effects', async () => {
    const a = await svc.listBestFitOpportunities({ limit: 4 });
    const b = await svc.listBestFitOpportunities({ limit: 4 });
    expect(a.rows).toEqual(b.rows);
    expect(a.ranking).toEqual(b.ranking);
    // Two calls in, two calls out — no retry, no fan-out, no caching surprise.
    expect(richDigest.topBonfire).toHaveBeenCalledTimes(2);
  });
});
