const {
  clamp,
  computeRevenueWeight,
  computeRuleSeeds,
  bindToSeed,
  computePriorityScore,
  computeSignals,
  normalizeCategory,
} = require('../../src/bonfire/bonfire.scoring');
const { computeEnrichmentHash, normalizeEstimatedValue } = require('../../src/bonfire/bonfire.util');

describe('Bonfire scoring — deterministic sub-scores', () => {
  describe('computeRevenueWeight', () => {
    it('buckets cents correctly', () => {
      expect(computeRevenueWeight(4_999_999)).toBe(20);   // <$50k
      expect(computeRevenueWeight(5_000_000)).toBe(50);   // $50k
      expect(computeRevenueWeight(50_000_000)).toBe(80);  // $500k
      expect(computeRevenueWeight(500_000_000)).toBe(100); // $5M
      expect(computeRevenueWeight(0)).toBe(20);
      expect(computeRevenueWeight(null)).toBe(20);
    });
  });

  describe('computeRuleSeeds', () => {
    it('returns category heuristics when category is known', () => {
      const seeds = computeRuleSeeds({ estimatedValue: 100_000_000, aiCategory: 'Staffing' });
      expect(seeds.revenue_weight).toBe(80);
      expect(seeds.ease_of_entry).toBe(85);
      expect(seeds.repeatability_seed).toBe(90);
      expect(seeds.automation_seed).toBe(75);
    });

    it('falls back to defaults for unknown category', () => {
      const seeds = computeRuleSeeds({ estimatedValue: 100_000, aiCategory: 'Xyz' });
      expect(seeds.ease_of_entry).toBe(50);
      expect(seeds.repeatability_seed).toBe(50);
    });
  });

  describe('bindToSeed — clamps AI sub-scores to rule seed ± delta', () => {
    it('clamps a hallucinated high value', () => {
      expect(bindToSeed(97, 50, 25)).toBe(75); // 50+25
    });
    it('clamps a hallucinated low value', () => {
      expect(bindToSeed(3, 80, 25)).toBe(55); // 80-25
    });
    it('passes through a value inside the band', () => {
      expect(bindToSeed(62, 50, 25)).toBe(62);
    });
    it('handles non-numeric input without crashing', () => {
      expect(bindToSeed('bad', 50, 25)).toBe(25); // falls to lower bound
    });
  });

  describe('computePriorityScore — deterministic weighted sum', () => {
    it('produces repeatable output for same inputs', () => {
      const a = computePriorityScore({ revenue_weight: 80, automation_potential: 75, repeatability: 70, ease_of_entry: 85 });
      const b = computePriorityScore({ revenue_weight: 80, automation_potential: 75, repeatability: 70, ease_of_entry: 85 });
      expect(a).toBe(b);
      expect(a).toBe(Math.round(0.4 * 80 + 0.3 * 75 + 0.2 * 70 + 0.1 * 85));
    });
    it('handles missing sub-scores as zero', () => {
      expect(computePriorityScore({ revenue_weight: 50 })).toBe(20); // 0.4 * 50
    });
  });

  describe('computeSignals', () => {
    const future = new Date(Date.now() + 20 * 86400_000); // 20 days out
    const farFuture = new Date(Date.now() + 90 * 86400_000);

    it('adds HIGH_ROI when priority >= 80 and value >= $500k', () => {
      const s = computeSignals({ priority_score: 85, estimated_value: 60_000_000, automation_potential: 50, repeatability: 50, ease_of_entry: 50 });
      expect(s).toContain('HIGH_ROI');
    });
    it('skips HIGH_ROI for smaller values', () => {
      const s = computeSignals({ priority_score: 85, estimated_value: 1_000_000, automation_potential: 50, repeatability: 50, ease_of_entry: 50 });
      expect(s).not.toContain('HIGH_ROI');
    });
    it('adds HIGH_AUTOMATION when automation >= 70', () => {
      const s = computeSignals({ priority_score: 50, estimated_value: 0, automation_potential: 75, repeatability: 50, ease_of_entry: 50 });
      expect(s).toContain('HIGH_AUTOMATION');
    });
    it('adds QUICK_WIN only when close_date within 30 days AND ease >= 75', () => {
      const s = computeSignals({ priority_score: 50, estimated_value: 0, automation_potential: 50, repeatability: 50, ease_of_entry: 80, close_date: future });
      expect(s).toContain('QUICK_WIN');
      const s2 = computeSignals({ priority_score: 50, estimated_value: 0, automation_potential: 50, repeatability: 50, ease_of_entry: 80, close_date: farFuture });
      expect(s2).not.toContain('QUICK_WIN');
    });
    it('adds PRODUCTIZABLE only when repeatability >= 75 AND recommended_product set', () => {
      expect(computeSignals({ priority_score: 50, repeatability: 80, recommended_product: 'StaffMatch' })).toContain('PRODUCTIZABLE');
      expect(computeSignals({ priority_score: 50, repeatability: 80, recommended_product: null })).not.toContain('PRODUCTIZABLE');
    });
  });

  describe('normalizeCategory', () => {
    it('returns exact enum match', () => {
      expect(normalizeCategory('Staffing')).toBe('Staffing');
      expect(normalizeCategory('staffing')).toBe('Staffing');
      expect(normalizeCategory('STAFFING')).toBe('Staffing');
    });
    it('falls back to Consulting for unrecognized values', () => {
      expect(normalizeCategory('Martian Services')).toBe('Consulting');
      expect(normalizeCategory(null)).toBe('Consulting');
    });
  });

  describe('clamp', () => {
    it('clamps within bounds and rounds', () => {
      expect(clamp(5.7, 0, 100)).toBe(6);
      expect(clamp(-5, 0, 100)).toBe(0);
      expect(clamp(120, 0, 100)).toBe(100);
      expect(clamp(NaN, 0, 100)).toBe(0);
    });
  });
});

describe('Bonfire util — idempotency + value normalization', () => {
  it('computeEnrichmentHash is stable and differs by version', () => {
    const a = computeEnrichmentHash('foo', 1);
    const b = computeEnrichmentHash('foo', 1);
    expect(a).toBe(b);
    const c = computeEnrichmentHash('foo', 2);
    expect(c).not.toBe(a);
    const d = computeEnrichmentHash('bar', 1);
    expect(d).not.toBe(a);
  });

  it('normalizeEstimatedValue converts dollars to cents', () => {
    expect(normalizeEstimatedValue(450_000)).toBe(45_000_000);
    expect(normalizeEstimatedValue('$450,000')).toBe(45_000_000);
    expect(normalizeEstimatedValue('450000')).toBe(45_000_000);
    expect(normalizeEstimatedValue(null)).toBeNull();
    expect(normalizeEstimatedValue('')).toBeNull();
  });

  it('normalizeEstimatedValue preserves very large values as cents', () => {
    // A huge value (>= 10B) is assumed already-cents to avoid double-multiplying programmatic clients.
    expect(normalizeEstimatedValue(15_000_000_000)).toBe(15_000_000_000);
  });
});
