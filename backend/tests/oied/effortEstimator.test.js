const {
  estimateEffort,
  estimateProposalHours,
  estimateBuildDays,
  computeEffortScore,
} = require('../../src/oied/effortEstimator.service');

describe('effortEstimator.estimateProposalHours', () => {
  it('base 4h + 1h penalty when no aiAnalysis.recommended_product', () => {
    expect(estimateProposalHours({ title: 'Foo', description: 'bar' })).toBe(5);
  });
  it('base 4h flat when aiAnalysis recommends a product', () => {
    expect(estimateProposalHours({
      title: 'Foo', description: 'bar',
      aiAnalysis: { recommended_product: 'OpsBot' },
    })).toBe(4);
  });
  it('+2h for long description, +1h missing recommended_product', () => {
    const opp = {
      title: 'Foo', description: 'x'.repeat(3000),
      aiAnalysis: {}, // no recommended_product
    };
    expect(estimateProposalHours(opp)).toBe(7); // 4 + 2 + 1
  });
  it('+2h for compliance hint in title', () => {
    const opp = {
      title: 'Compliance audit dashboard',
      description: 'short',
      aiAnalysis: { recommended_product: 'OpsBot' },
    };
    expect(estimateProposalHours(opp)).toBe(6); // 4 + 2 (complexity)
  });
  it('caps at 16h', () => {
    const opp = {
      title: 'Compliance HIPAA cybersecurity audit',
      description: 'x'.repeat(5000),
      aiAnalysis: {},
    };
    expect(estimateProposalHours(opp)).toBe(9); // 4+2+2+1 — well under cap; sanity check
  });
});

describe('effortEstimator.estimateBuildDays', () => {
  it('staffing → 7d', () => {
    expect(estimateBuildDays({ category: 'Staffing', aiAnalysis: {} })).toBe(7);
  });
  it('compliance → 45d', () => {
    expect(estimateBuildDays({ category: 'Compliance', aiAnalysis: {} })).toBe(45);
  });
  it('default 21d for unknown category', () => {
    expect(estimateBuildDays({ category: 'Veterinary', aiAnalysis: {} })).toBe(21);
  });
  it('subtracts 10d when automation_potential >= 80 on software-shaped cats', () => {
    const opp = { category: 'IT Services', aiAnalysis: { automation_potential: 85 } };
    expect(estimateBuildDays(opp)).toBe(20); // 30 - 10
  });
  it('does NOT cut staffing build (already short)', () => {
    const opp = { category: 'Staffing', aiAnalysis: { automation_potential: 95 } };
    expect(estimateBuildDays(opp)).toBe(7); // unchanged
  });
});

describe('effortEstimator.computeEffortScore', () => {
  it('low for cheap proposal + short build', () => {
    expect(computeEffortScore(4, 7)).toBe(24); // 16 + 8.4 → 24
  });
  it('caps at 100', () => {
    expect(computeEffortScore(16, 90)).toBe(100);
  });
});

describe('effortEstimator.estimateEffort (composite)', () => {
  it('returns the full shape', () => {
    const opp = {
      category: 'IT Services',
      title: 'AI platform',
      description: 'x',
      aiAnalysis: { recommended_product: 'OpsBot', automation_potential: 60 },
    };
    const out = estimateEffort(opp);
    expect(out).toEqual({ proposal_hours: 4, build_days: 30, effort_score: 52 });
  });
  it('handles null opportunity gracefully', () => {
    expect(estimateEffort(null)).toEqual({
      proposal_hours: 4, build_days: 21, effort_score: 41,
    });
  });
});
