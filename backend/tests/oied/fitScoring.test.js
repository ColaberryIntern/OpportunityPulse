// Mock models so the service can require them without DB.
jest.mock('../../src/models', () => ({
  sequelize: {},
  OpportunityFitScore: {
    findOne: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue([null]),
  },
}));

const {
  calculateFitScore,
  scoreServiceMatch,
  scoreRevenueWeight,
  scoreAutomation,
  scoreRepeatability,
  scoreEaseOfEntry,
  scoreStrategicAlignment,
  DEFAULT_PROFILE,
} = require('../../src/oied/fitScoring.service');

describe('fitScoring component scorers', () => {
  it('scoreServiceMatch caps at 25 and rewards exact category match', () => {
    const opp = {
      category: 'IT Services',
      title: 'Enterprise data analytics platform',
      description: 'staffing automation consulting',
    };
    const s = scoreServiceMatch(opp, DEFAULT_PROFILE);
    expect(s).toBeLessThanOrEqual(25);
    expect(s).toBeGreaterThanOrEqual(15); // exact category gives 15
  });

  it('scoreServiceMatch is 0 when nothing matches', () => {
    expect(scoreServiceMatch({ category: 'unrelated', title: 'pizza delivery' }, DEFAULT_PROFILE)).toBe(0);
  });

  it('scoreRevenueWeight buckets by value', () => {
    expect(scoreRevenueWeight({ value: 0 })).toBe(0);
    expect(scoreRevenueWeight({ value: 999 })).toBe(4);
    expect(scoreRevenueWeight({ value: 49_999 })).toBe(4);
    expect(scoreRevenueWeight({ value: 100_000 })).toBe(10);
    expect(scoreRevenueWeight({ value: 1_000_000 })).toBe(16);
    expect(scoreRevenueWeight({ value: 10_000_000 })).toBe(20);
  });

  it('scoreAutomation/Repeatability/EaseOfEntry rescale 0-100 to component max', () => {
    expect(scoreAutomation({ aiAnalysis: { automation_potential: 100 } })).toBe(15);
    expect(scoreAutomation({ aiAnalysis: { automation_potential: 0 } })).toBe(0);
    expect(scoreAutomation({})).toBe(7); // mid default when AI data missing

    expect(scoreRepeatability({ aiAnalysis: { repeatability: 100 } })).toBe(15);
    expect(scoreEaseOfEntry({ aiAnalysis: { ease_of_entry: 100 } })).toBe(10);
  });

  it('scoreStrategicAlignment rewards TX location + tag overlap + signals', () => {
    const opp = {
      location: 'City of Austin (TX)',
      title: 'AI automation platform for data analytics',
      description: '',
      aiAnalysis: { signals: ['HIGH_AUTOMATION', 'PRODUCTIZABLE'] },
    };
    const s = scoreStrategicAlignment(opp, DEFAULT_PROFILE);
    expect(s).toBeGreaterThanOrEqual(10);
    expect(s).toBeLessThanOrEqual(15);
  });
});

describe('fitScoring.calculateFitScore', () => {
  it('returns deterministic identical results for identical inputs', () => {
    const opp = {
      id: 1,
      title: 'AI Data Analytics Platform',
      description: 'automation staffing',
      category: 'IT Services',
      value: 1_500_000,
      location: 'Dallas, TX',
      aiAnalysis: {
        automation_potential: 80,
        repeatability: 70,
        ease_of_entry: 60,
        signals: ['HIGH_AUTOMATION'],
      },
    };
    const a = calculateFitScore({ opportunity: opp });
    const b = calculateFitScore({ opportunity: opp });
    expect(a).toEqual(b);
  });

  it('total fit_score equals the sum of components and is clamped 0-100', () => {
    const opp = {
      title: 'AI automation data platform staffing',
      description: 'consulting',
      category: 'IT Services',
      value: 2_000_000,
      location: 'Austin TX',
      aiAnalysis: {
        automation_potential: 90,
        repeatability: 85,
        ease_of_entry: 80,
        signals: ['HIGH_AUTOMATION', 'PRODUCTIZABLE', 'QUICK_WIN', 'HIGH_ROI'],
      },
    };
    const r = calculateFitScore({ opportunity: opp });
    const sum = r.service_match + r.revenue_weight + r.automation_score
              + r.repeatability_score + r.ease_of_entry + r.strategic_alignment;
    expect(r.fit_score).toBe(Math.min(100, sum));
    expect(r.fit_score).toBeLessThanOrEqual(100);
    expect(r.fit_score).toBeGreaterThanOrEqual(0);
  });

  it('component bounds: each component never exceeds its declared max', () => {
    const max_opp = {
      title: 'AI automation data platform staffing analytics',
      description: 'consulting compliance it-services data-science',
      category: 'IT Services',
      value: 50_000_000,
      location: 'TX texas dallas houston austin',
      aiAnalysis: {
        automation_potential: 100,
        repeatability: 100,
        ease_of_entry: 100,
        signals: ['A', 'B', 'C', 'D', 'E', 'F'],
      },
    };
    const r = calculateFitScore({ opportunity: max_opp });
    expect(r.service_match).toBeLessThanOrEqual(25);
    expect(r.revenue_weight).toBeLessThanOrEqual(20);
    expect(r.automation_score).toBeLessThanOrEqual(15);
    expect(r.repeatability_score).toBeLessThanOrEqual(15);
    expect(r.ease_of_entry).toBeLessThanOrEqual(10);
    expect(r.strategic_alignment).toBeLessThanOrEqual(15);
  });

  it('zero-input yields a low but non-negative score', () => {
    const r = calculateFitScore({ opportunity: { title: '', value: 0 } });
    expect(r.fit_score).toBeGreaterThanOrEqual(0);
    expect(r.fit_score).toBeLessThanOrEqual(100);
  });

  it('throws when opportunity is missing', () => {
    expect(() => calculateFitScore({ opportunity: null })).toThrow();
  });
});
