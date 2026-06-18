// Unit tests for running SAM.gov opps through the Bonfire scorer (deterministic,
// NAICS-derived category). No I/O.
const { naicsToCategory, scoreSamWithBonfire } = require('../../src/govContracts/bonfireScoreSamGov.service');

describe('naicsToCategory', () => {
  test('maps known NAICS to Bonfire categories', () => {
    expect(naicsToCategory('541512')).toBe('IT Services');
    expect(naicsToCategory('518210')).toBe('Data & Analytics');
    expect(naicsToCategory('541715')).toBe('Data & Analytics');
    expect(naicsToCategory('541611')).toBe('Consulting');
    expect(naicsToCategory('611420')).toBe('Education');
  });
  test('falls back to Consulting for unknown/empty', () => {
    expect(naicsToCategory('999999')).toBe('Consulting');
    expect(naicsToCategory(null)).toBe('Consulting');
    expect(naicsToCategory('')).toBe('Consulting');
  });
  test('strips non-digits and extra characters', () => {
    expect(naicsToCategory('541512XYZ')).toBe('IT Services');
    expect(naicsToCategory(541512)).toBe('IT Services');
  });
});

describe('scoreSamWithBonfire', () => {
  test('IT Services, no value -> deterministic 48', () => {
    // seeds: ease 60, rep 65, auto 70; value null -> revenue_weight 20
    // 0.4*20 + 0.3*70 + 0.2*65 + 0.1*60 = 8 + 21 + 13 + 6 = 48
    const r = scoreSamWithBonfire({ value: null, sourceData: { naicsCode: '541512' }, expiresAt: null });
    expect(r.ai_category).toBe('IT Services');
    expect(r.revenue_weight).toBe(20);
    expect(r.priority_score).toBe(48);
  });
  test('value $1M lifts the revenue weight -> 72', () => {
    // revenue_weight 80 -> 0.4*80 + 21 + 13 + 6 = 72
    const r = scoreSamWithBonfire({ value: 1000000, sourceData: { naicsCode: '541512' } });
    expect(r.revenue_weight).toBe(80);
    expect(r.priority_score).toBe(72);
  });
  test('Data & Analytics seeds -> 52 (no value)', () => {
    // ease 60, rep 70, auto 80, rev 20 -> 8 + 24 + 14 + 6 = 52
    const r = scoreSamWithBonfire({ value: null, sourceData: { naicsCode: '518210' } });
    expect(r.ai_category).toBe('Data & Analytics');
    expect(r.priority_score).toBe(52);
  });
  test('unknown NAICS -> Consulting seeds, never throws', () => {
    const r = scoreSamWithBonfire({ value: null, sourceData: {} });
    expect(r.ai_category).toBe('Consulting');
    expect(typeof r.priority_score).toBe('number');
    expect(Array.isArray(r.signals)).toBe(true);
  });
  test('is on the same 0-100 scale and stamps scorer id', () => {
    const r = scoreSamWithBonfire({ value: 600000, sourceData: { naicsCode: '518210' } });
    expect(r.priority_score).toBeGreaterThanOrEqual(0);
    expect(r.priority_score).toBeLessThanOrEqual(100);
    expect(r.scorer).toBe('bonfire_on_samgov');
  });
});
