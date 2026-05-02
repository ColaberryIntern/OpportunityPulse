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
} = require('../../src/oied/fitScoring.service');

// Test profile mirroring the global default but with a $50k min deal size.
const TEST_PROFILE = {
  services: ['ai-systems', 'data-analytics', 'staffing', 'compliance', 'consulting', 'it-services', 'automation'],
  industries: ['IT Services', 'Data & Analytics', 'Staffing', 'Compliance'],
  minDealSize: 50000,
  tools: [],
  pastWins: ['DHA compliance audit', 'Austin data analytics platform'],
  riskTolerance: 'medium',
  preferences: { geoPreference: ['tx', 'texas', 'austin', 'dallas'], strategicTags: ['ai', 'data'] },
};

describe('fitScoring v2 component scorers', () => {
  it('scoreServiceMatch rewards opportunity tags + title keyword matches', () => {
    const opp = {
      tags: ['ai-systems', 'automation'],
      title: 'Enterprise data-analytics platform',
      description: 'consulting compliance',
    };
    const s = scoreServiceMatch(opp, TEST_PROFILE);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(25);
  });
  it('scoreServiceMatch returns 0 when profile.services is empty', () => {
    expect(scoreServiceMatch({ tags: ['x'] }, { services: [] })).toBe(0);
  });

  it('scoreRevenueWeight = 0 when value < min_deal_size (deal-size gate)', () => {
    expect(scoreRevenueWeight({ value: 10000 }, TEST_PROFILE)).toBe(0); // < $50k min
    expect(scoreRevenueWeight({ value: 60000 }, TEST_PROFILE)).toBe(10);
  });
  it('scoreRevenueWeight buckets after gate clears', () => {
    expect(scoreRevenueWeight({ value: 60000 },     TEST_PROFILE)).toBe(10);
    expect(scoreRevenueWeight({ value: 1_000_000 }, TEST_PROFILE)).toBe(16);
    expect(scoreRevenueWeight({ value: 10_000_000 }, TEST_PROFILE)).toBe(20);
  });

  it('scoreAutomation/Repeatability/EaseOfEntry rescale 0-100 → component max', () => {
    expect(scoreAutomation({ aiAnalysis: { automation_potential: 100 } })).toBe(15);
    expect(scoreRepeatability({ aiAnalysis: { repeatability: 50 } })).toBe(8);
    expect(scoreEaseOfEntry({ aiAnalysis: { ease_of_entry: 100 } })).toBe(10);
  });

  it('scoreStrategicAlignment rewards industry match + past-wins keywords + geo + signals', () => {
    const opp = {
      category: 'IT Services',
      title: 'Compliance audit dashboard for Texas',
      description: 'data analytics for Austin',
      location: 'Austin, TX',
      aiAnalysis: { signals: ['HIGH_AUTOMATION', 'PRODUCTIZABLE'] },
    };
    const s = scoreStrategicAlignment(opp, TEST_PROFILE);
    expect(s).toBeGreaterThan(8); // industry + past-wins + geo + signals all hit
    expect(s).toBeLessThanOrEqual(15);
  });
  it('scoreStrategicAlignment returns 0 when nothing matches', () => {
    expect(scoreStrategicAlignment(
      { category: 'Unrelated', title: 'x', description: '', location: '' },
      { industries: [], pastWins: [], preferences: {} },
    )).toBe(0);
  });
});

describe('fitScoring v2 calculateFitScore', () => {
  it('throws when userProfile is missing (no hidden default)', () => {
    expect(() => calculateFitScore({ opportunity: { value: 1 } })).toThrow(/userProfile/);
  });
  it('returns deterministic identical results for identical inputs', () => {
    const opp = {
      tags: ['ai-systems'],
      title: 'AI Data platform automation',
      description: 'consulting',
      category: 'IT Services',
      value: 1_500_000,
      location: 'Dallas, TX',
      aiAnalysis: { automation_potential: 80, repeatability: 70, ease_of_entry: 60, signals: ['HIGH_AUTOMATION'] },
    };
    const a = calculateFitScore({ opportunity: opp, userProfile: TEST_PROFILE });
    const b = calculateFitScore({ opportunity: opp, userProfile: TEST_PROFILE });
    expect(a).toEqual(b);
  });
  it('total fit_score equals sum of components and is 0-100', () => {
    const opp = {
      tags: ['ai-systems', 'automation'],
      title: 'AI automation data platform staffing',
      category: 'IT Services',
      value: 2_000_000,
      location: 'Austin TX',
      aiAnalysis: { automation_potential: 90, repeatability: 85, ease_of_entry: 80, signals: ['A','B'] },
    };
    const r = calculateFitScore({ opportunity: opp, userProfile: TEST_PROFILE });
    const sum = r.service_match + r.revenue_weight + r.automation_score
              + r.repeatability_score + r.ease_of_entry + r.strategic_alignment;
    expect(r.fit_score).toBe(Math.min(100, sum));
    expect(r.fit_score).toBeLessThanOrEqual(100);
    expect(r.fit_score).toBeGreaterThanOrEqual(0);
  });
  it('component bounds: each component never exceeds its declared max', () => {
    const max = {
      tags: ['ai-systems', 'automation', 'data-analytics', 'consulting', 'staffing'],
      title: 'AI automation data analytics platform staffing consulting compliance it-services',
      description: 'every keyword',
      category: 'IT Services',
      value: 50_000_000,
      location: 'TX texas dallas houston austin',
      aiAnalysis: { automation_potential: 100, repeatability: 100, ease_of_entry: 100, signals: ['1','2','3','4','5'] },
    };
    const r = calculateFitScore({ opportunity: max, userProfile: TEST_PROFILE });
    expect(r.service_match).toBeLessThanOrEqual(25);
    expect(r.revenue_weight).toBeLessThanOrEqual(20);
    expect(r.automation_score).toBeLessThanOrEqual(15);
    expect(r.repeatability_score).toBeLessThanOrEqual(15);
    expect(r.ease_of_entry).toBeLessThanOrEqual(10);
    expect(r.strategic_alignment).toBeLessThanOrEqual(15);
  });
  it('reasoning includes profile_hash for cache lookup', () => {
    const r = calculateFitScore({
      opportunity: { value: 100000, title: 'x', tags: [] },
      userProfile: TEST_PROFILE,
    });
    expect(r.reasoning.profile_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
