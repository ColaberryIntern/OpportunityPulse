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
  it('compounds length tier + section + missing-product penalty', () => {
    // v6 length tier (>4000 chars → +3), compliance section (+2), no
    // recommended_product (+1) on top of base 4 → 10.
    const opp = {
      title: 'Compliance HIPAA cybersecurity audit',
      description: 'x'.repeat(5000),
      aiAnalysis: {},
    };
    expect(estimateProposalHours(opp)).toBe(10);
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
  it('returns the v3-compatible numbers (toMatchObject leaves room for v6 fields)', () => {
    const opp = {
      category: 'IT Services',
      title: 'AI platform',
      description: 'x',
      aiAnalysis: { recommended_product: 'OpsBot', automation_potential: 60 },
    };
    const out = estimateEffort(opp);
    expect(out).toMatchObject({ proposal_hours: 4, build_days: 30, effort_score: 52 });
  });
  it('handles null opportunity gracefully', () => {
    expect(estimateEffort(null)).toMatchObject({
      proposal_hours: 4, build_days: 21, effort_score: 41,
    });
  });
});

// ---------- v6: Adaptive layer ----------

const {
  detectSections,
  lengthHours,
  PROPOSAL_HOURS_CAP,
} = require('../../src/oied/effortEstimator.service');

describe('effortEstimator.lengthHours (v6 RFP-length tiers)', () => {
  it('returns 0 for short text', () => {
    expect(lengthHours(500)).toBe(0);
  });
  it('returns 1, 2, 3, 4 across length tiers', () => {
    expect(lengthHours(1000)).toBe(1);
    expect(lengthHours(3000)).toBe(2);
    expect(lengthHours(6000)).toBe(3);
    expect(lengthHours(10_000)).toBe(4);
  });
});

describe('effortEstimator.detectSections (v6 required-section detection)', () => {
  it('finds SOW / pricing / compliance / past_performance keywords', () => {
    const t = 'this RFP has a Statement of Work, fee schedule, '
      + 'compliance requirements, and past performance references.';
    const out = detectSections(t.toLowerCase());
    expect(out.sections.sort()).toEqual(['compliance', 'past_performance', 'pricing', 'sow']);
    // sow=2 + pricing=1 + compliance=2 + past_performance=1 = 6
    expect(out.hours).toBe(6);
  });
  it('returns empty when no keywords match', () => {
    expect(detectSections('hello world').sections).toEqual([]);
  });
});

describe('effortEstimator v6: adaptive proposal hours', () => {
  it('SPEC: effort varies by RFP length tier', () => {
    const base = {
      title: 'Foo', category: 'Staffing',
      aiAnalysis: { recommended_product: 'X' },
    };
    const short = estimateProposalHours({ ...base, description: 'x'.repeat(500) });
    const mid   = estimateProposalHours({ ...base, description: 'x'.repeat(3000) });
    const long  = estimateProposalHours({ ...base, description: 'x'.repeat(10_000) });
    expect(short).toBe(4);            // base only
    expect(mid).toBe(4 + 2);          // +2h length
    expect(long).toBe(4 + 4);         // +4h length
  });

  it('compliance section adds +2h, pricing section adds +1h', () => {
    const opp = {
      title: 'RFP cybersecurity audit', description: 'cost proposal due',
      aiAnalysis: { recommended_product: 'X' }, category: 'Compliance',
    };
    // base 4 + compliance 2 + pricing 1 + past_performance 0 = 7
    expect(estimateProposalHours(opp)).toBe(7);
  });

  it('historical avg blends 50/50 when present', () => {
    const opp = {
      title: 'Foo', description: 'x', aiAnalysis: { recommended_product: 'X' },
    };
    // Heuristic = 4. Blend with historical 12 → (4 + 12) / 2 = 8.
    expect(estimateProposalHours(opp, { historicalAvgHours: 12 })).toBe(8);
  });

  it('historical of 0 is ignored (treats as missing)', () => {
    const opp = {
      title: 'Foo', description: 'x', aiAnalysis: { recommended_product: 'X' },
    };
    expect(estimateProposalHours(opp, { historicalAvgHours: 0 })).toBe(4);
  });

  it('caps at PROPOSAL_HOURS_CAP (40h)', () => {
    const opp = {
      title: 'Compliance HIPAA cybersecurity audit secret clearance',
      description: 'x'.repeat(20_000),
      aiAnalysis: {}, // no recommended_product → +1
      sourceData: { raw_text: 'past performance and statement of work and pricing' },
    };
    // Heuristic alone: 4 base + 4 length + 6 sections (sow/pricing/
    // compliance/past) + 1 missing-product = 15. Blend with extreme
    // historical 200 → (15+200)/2 = 107.5 → capped at 40.
    expect(estimateProposalHours(opp, { historicalAvgHours: 200 })).toBe(PROPOSAL_HOURS_CAP);
  });

  it('floor at PROPOSAL_HOURS_FLOOR (2h)', () => {
    // The floor only kicks in defensively. Realistic inputs won't go
    // this low because base is 4. But blend with a small historical
    // proves the floor returns a positive number even at the boundary.
    const opp = {
      title: 'X', description: '', aiAnalysis: { recommended_product: 'P' },
    };
    // (4 + 1) / 2 = 2.5 → Math.round → 3. Result is at least the floor.
    expect(estimateProposalHours(opp, { historicalAvgHours: 1 })).toBeGreaterThanOrEqual(2);
  });
});

describe('effortEstimator v6: estimateEffort returns required_sections + historical_avg_hours', () => {
  it('echoes detected sections + historical_avg_hours', () => {
    const opp = {
      title: 'RFP for SOW + pricing review',
      description: 'compliance certification required',
      category: 'Compliance',
      aiAnalysis: { recommended_product: 'X' },
    };
    const out = estimateEffort(opp, { historicalAvgHours: 6 });
    expect(out.required_sections.sort()).toEqual(['compliance', 'pricing', 'sow']);
    expect(out.historical_avg_hours).toBe(6);
  });
  it('historical_avg_hours is null when not provided', () => {
    const opp = { title: 'X', description: 'y', aiAnalysis: { recommended_product: 'p' } };
    expect(estimateEffort(opp).historical_avg_hours).toBeNull();
  });
});
