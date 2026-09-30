jest.mock('../../src/logging/logger', () => ({ info() {}, warn() {}, error() {}, debug() {} }));
const mockBfFindAll = jest.fn();
const mockOppFindAll = jest.fn();
jest.mock('../../src/models', () => ({
  BonfireOpportunity: { findAll: (...a) => mockBfFindAll(...a) },
  Opportunity: { findAll: (...a) => mockOppFindAll(...a) },
}));

const {
  backfillDisqualification, shouldWrite, isDocVet, sameVerdict,
} = require('../../src/govContracts/disqualification.backfill');
const { DISQUALIFIERS } = require('../../src/govContracts/disqualification.service');

describe('backfill guards (unit)', () => {
  test('isDocVet only true for a document_deep_vet auto:false verdict', () => {
    expect(isDocVet({ auto: false, scorer: 'document_deep_vet' })).toBe(true);
    expect(isDocVet({ auto: false })).toBe(false); // a code-defined known verdict
    expect(isDocVet({ auto: true })).toBe(false);
    expect(isDocVet(null)).toBe(false);
  });

  test('sameVerdict compares meaningful fields, ignores vetted_at', () => {
    const a = { status: 'no_bid', disqualifier: 'CERT_WALL', label: 'x', vetted_at: '2026-01-01' };
    const b = { status: 'no_bid', disqualifier: 'CERT_WALL', label: 'x', vetted_at: '2026-06-29' };
    expect(sameVerdict(a, b)).toBe(true);
    expect(sameVerdict(a, { ...b, status: 'conditional' })).toBe(false);
    expect(sameVerdict(null, b)).toBe(false);
  });

  test('shouldWrite protects doc-vets, blocks downgrades + no-ops', () => {
    const docVet = { auto: false, scorer: 'document_deep_vet', status: 'no_bid' };
    expect(shouldWrite(docVet, { auto: false, status: 'bid' })).toBe(false); // sacrosanct
    expect(shouldWrite({ auto: false, status: 'no_bid', label: 'k' }, { auto: true, status: 'needs_review' })).toBe(false); // no downgrade
    expect(shouldWrite({ status: 'no_bid', label: 'k' }, { status: 'no_bid', label: 'k' })).toBe(false); // idempotent
    expect(shouldWrite(null, null)).toBe(false);
    expect(shouldWrite(null, { status: 'needs_review', label: 'k' })).toBe(true);
    expect(shouldWrite({ auto: false, status: 'no_bid', label: 'old' }, { auto: false, status: 'conditional', label: 'new' })).toBe(true);
  });
});

describe('backfillDisqualification (integration over mocked rows)', () => {
  beforeEach(() => { mockBfFindAll.mockReset(); mockOppFindAll.mockReset(); });

  test('propagates posture to a stored known verdict, protects doc-vets, stays idempotent', async () => {
    const row = (title, vetVerdict) => ({ title, agency: '', description: '', vetVerdict, update: jest.fn().mockResolvedValue() });

    // A — previously-stored SOC-2-only known no_bid (auto:false, NO scorer). Posture now
    //     makes it a conditional watchlist row -> must be refreshed.
    const a = row('Salt Lake City Agenda Management Platform',
      { status: 'no_bid', disqualifier: 'CERT_WALL', label: 'No-bid: SOC 2 (Salt Lake City)', auto: false });
    // B — a real document deep-vet -> sacrosanct, never touched.
    const b = row('Some Hosted Platform',
      { status: 'no_bid', disqualifier: 'CERT_WALL', label: 'TX-RAMP', auto: false, scorer: 'document_deep_vet' });
    // C — null verdict, physical scope -> gets a fresh auto-flag.
    const c = row('Plumbing Services', null);
    // D — null verdict, clean candidate -> verdictFor returns null, nothing written.
    const d = row('AI Readiness Assessment Advisory', null);
    // E — already equals the computed auto-flag -> idempotent, no write.
    const e = row('Roofing Replacement',
      { status: 'needs_review', disqualifier: 'PHYSICAL_INSTALL', label: `Likely no-bid: ${DISQUALIFIERS.PHYSICAL_INSTALL}`, auto: true });

    mockBfFindAll.mockResolvedValue([a, b, c, d, e]);
    mockOppFindAll.mockResolvedValue([]);

    const summary = await backfillDisqualification();

    expect(a.update).toHaveBeenCalledWith({ vetVerdict: expect.objectContaining({ status: 'conditional' }) });
    expect(b.update).not.toHaveBeenCalled();
    expect(c.update).toHaveBeenCalledWith({ vetVerdict: expect.objectContaining({ disqualifier: 'PHYSICAL_INSTALL' }) });
    expect(d.update).not.toHaveBeenCalled();
    expect(e.update).not.toHaveBeenCalled();
    expect(summary.bonfire_updated).toBe(2);
  });
});
