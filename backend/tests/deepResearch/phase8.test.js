// Deep Research Phase 8 — pure-logic tests across the 8 services.

const pursuitActivation = require('../../src/deepResearch/pursuitActivation.service');
const reviewQueueBridge = require('../../src/deepResearch/reviewQueueBridge.service');
const proposalReadiness = require('../../src/deepResearch/proposalReadiness.service');
const ventureConflict = require('../../src/deepResearch/ventureConflict.service');
const researchRevenue = require('../../src/deepResearch/researchRevenue.service');
const captureStrategy = require('../../src/deepResearch/captureStrategy.service');
const submissionReadiness = require('../../src/deepResearch/submissionReadiness.service');

// ---- pursuitActivation --------------------------------------------------

describe('pursuitActivation.anchorKindFor', () => {
  it('maps venture/cluster/pattern to their direct anchor', () => {
    expect(pursuitActivation.anchorKindFor('venture')).toBe('venture');
    expect(pursuitActivation.anchorKindFor('cluster')).toBe('cluster');
    expect(pursuitActivation.anchorKindFor('pattern')).toBe('pattern');
  });
  it('maps recurring-entity sources (agency/technology/etc) to "custom"', () => {
    for (const k of ['agency', 'technology', 'opportunity_group', 'ecosystem', 'research_run']) {
      expect(pursuitActivation.anchorKindFor(k)).toBe('custom');
    }
  });
  it('falls back to "custom" for unknown source kinds', () => {
    expect(pursuitActivation.anchorKindFor('something-new')).toBe('custom');
  });
});

describe('pursuitActivation.defaultPursuitName', () => {
  it('uses the friendly source label + title', () => {
    expect(pursuitActivation.defaultPursuitName('cluster', 'AI Ops')).toBe('Cluster: AI Ops — pursuit');
    expect(pursuitActivation.defaultPursuitName('agency', 'DOD')).toBe('Agency: DOD — pursuit');
  });
});

// ---- reviewQueueBridge --------------------------------------------------

describe('reviewQueueBridge.SUPPORTED_TYPES', () => {
  it('whitelists proposal/offer/analysis only', () => {
    expect(reviewQueueBridge.SUPPORTED_TYPES.has('proposal')).toBe(true);
    expect(reviewQueueBridge.SUPPORTED_TYPES.has('offer')).toBe(true);
    expect(reviewQueueBridge.SUPPORTED_TYPES.has('analysis')).toBe(true);
    expect(reviewQueueBridge.SUPPORTED_TYPES.has('resume')).toBe(false);
    expect(reviewQueueBridge.SUPPORTED_TYPES.has('garbage')).toBe(false);
  });
});

// ---- proposalReadiness --------------------------------------------------

describe('proposalReadiness.clamp', () => {
  it('clamps to 0..100', () => {
    expect(proposalReadiness.clamp(-10)).toBe(0);
    expect(proposalReadiness.clamp(150)).toBe(100);
    expect(proposalReadiness.clamp(55)).toBe(55);
  });
});

describe('proposalReadiness.classify', () => {
  it('returns "ready" for high composite + few blockers', () => {
    expect(proposalReadiness.classify(80, [])).toBe('ready');
  });
  it('returns "needs_prep" for mid composite', () => {
    expect(proposalReadiness.classify(60, [])).toBe('needs_prep');
  });
  it('returns "blocked" for many blockers', () => {
    expect(proposalReadiness.classify(80, ['a', 'b', 'c'])).toBe('blocked');
  });
  it('returns "blocked" for low composite + multiple blockers', () => {
    expect(proposalReadiness.classify(30, ['a', 'b'])).toBe('blocked');
  });
});

describe('proposalReadiness.deriveBlockersAndAccelerators', () => {
  it('flags compliance + staffing blockers', () => {
    const out = proposalReadiness.deriveBlockersAndAccelerators({
      compliance: { score: 20, required: 5, ready: 1 },
      staffing: { score: 30 },
      capability: { score: 80 },
      asset: { score: 90, total_assets: 12 },
      dependency: { score: 100, total: 0, resolved: 0 },
      acceleration: { score: 40, approved: 0, drafted: 2 },
    });
    expect(out.blockers.length).toBeGreaterThanOrEqual(2);
    expect(out.accelerators.some((s) => /reusable proposal assets/.test(s))).toBe(true);
  });
});

describe('proposalReadiness.effortHoursFromComposite', () => {
  it('drops effort as composite rises', () => {
    const high = proposalReadiness.effortHoursFromComposite(90, 5);
    const low = proposalReadiness.effortHoursFromComposite(30, 5);
    expect(low).toBeGreaterThan(high);
  });
});

// ---- ventureConflict ----------------------------------------------------

describe('ventureConflict.jaccard', () => {
  it('returns 0 for disjoint sets and 1 for identical sets', () => {
    expect(ventureConflict.jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
    expect(ventureConflict.jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
  });
  it('returns 1/3 for one shared token in three-token union', () => {
    expect(ventureConflict.jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(0.333, 2);
  });
});

describe('ventureConflict.classifyConflictType', () => {
  it('returns semantic_overlap for high feat', () => {
    expect(ventureConflict.classifyConflictType({ catOverlap: 0, feat: 0.6, semantic: 0.6 }))
      .toBe('semantic_overlap');
  });
  it('returns feature_overlap when feat is moderate', () => {
    expect(ventureConflict.classifyConflictType({ catOverlap: 0, feat: 0.3, semantic: 0.3 }))
      .toBe('feature_overlap');
  });
  it('returns category_overlap when only category aligns', () => {
    expect(ventureConflict.classifyConflictType({ catOverlap: 1, feat: 0.05, semantic: 0.05 }))
      .toBe('category_overlap');
  });
  it('falls back to ecosystem_overlap', () => {
    expect(ventureConflict.classifyConflictType({ catOverlap: 0, feat: 0.05, semantic: 0.05 }))
      .toBe('ecosystem_overlap');
  });
});

describe('ventureConflict.severityScore', () => {
  it('boosts severity for dominant/explosive tools', () => {
    const cold = ventureConflict.severityScore({ feat: 0.3, catOverlap: 0, momentumStage: 'emerging' });
    const hot = ventureConflict.severityScore({ feat: 0.3, catOverlap: 0, momentumStage: 'explosive' });
    expect(hot).toBeGreaterThan(cold);
  });
  it('clamps to 0..100', () => {
    expect(ventureConflict.severityScore({ feat: 1, catOverlap: 1, momentumStage: 'explosive' }))
      .toBeLessThanOrEqual(100);
    expect(ventureConflict.severityScore({ feat: 0, catOverlap: 0, momentumStage: 'declining' }))
      .toBeGreaterThanOrEqual(0);
  });
});

describe('ventureConflict.differentiationHints', () => {
  it('suggests SMB angle for enterprise-priced tools', () => {
    const hints = ventureConflict.differentiationHints({
      ventureMeta: {}, tool: { pricingTier: 'enterprise' }, sharedTokens: [],
    });
    expect(hints.some((h) => /mid-market or SMB/.test(h))).toBe(true);
  });
});

// ---- researchRevenue ----------------------------------------------------

describe('researchRevenue.implementationDemandScore', () => {
  it('rises with opps + agency diversity + funded tools', () => {
    const low = researchRevenue.implementationDemandScore({ opps: 1, agencyCount: 0, fundedToolCount: 0 });
    const high = researchRevenue.implementationDemandScore({ opps: 30, agencyCount: 5, fundedToolCount: 4 });
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
  });
});

describe('researchRevenue.strengthScore', () => {
  it('decays with recencyDays', () => {
    const fresh = researchRevenue.strengthScore({ implementationDemand: 80, signalRecencyDays: 30 });
    const stale = researchRevenue.strengthScore({ implementationDemand: 80, signalRecencyDays: 360 });
    expect(fresh).toBeGreaterThan(stale);
  });
});

// ---- captureStrategy ---------------------------------------------------

describe('captureStrategy.deriveDifferentiators', () => {
  it('warns against feature parity when dominant incumbents exist', () => {
    const out = captureStrategy.deriveDifferentiators({
      saturation: 'crowded',
      competingToolsList: [
        { momentumStage: 'dominant' }, { momentumStage: 'explosive' },
      ],
    });
    expect(out.some((d) => /not feature parity/.test(d.label))).toBe(true);
  });
  it('claims framework angle for empty/emerging spaces', () => {
    const out = captureStrategy.deriveDifferentiators({
      saturation: 'empty', competingToolsList: [],
    });
    expect(out.some((d) => /first to do this/.test(d.label))).toBe(true);
  });
});

describe('captureStrategy.deriveIncumbentRisks', () => {
  it('only flags dominant + explosive tools', () => {
    const out = captureStrategy.deriveIncumbentRisks({
      competingToolsList: [
        { name: 'A', vendor: 'X', momentumStage: 'dominant', trendingScore: 80 },
        { name: 'B', vendor: 'Y', momentumStage: 'emerging', trendingScore: 30 },
        { name: 'C', vendor: 'Z', momentumStage: 'explosive', trendingScore: 90 },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out.every((r) => ['dominant', 'explosive'].includes(r.momentum))).toBe(true);
  });
});

describe('captureStrategy.derivePartnershipOpportunities', () => {
  it('targets open-source and emerging tools', () => {
    const out = captureStrategy.derivePartnershipOpportunities({
      competingToolsList: [
        { name: 'O', vendor: 'X', openSource: true, momentumStage: 'accelerating' },
        { name: 'E', vendor: 'Y', openSource: false, momentumStage: 'emerging' },
        { name: 'D', vendor: 'Z', openSource: false, momentumStage: 'dominant' },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.partner === 'D')).toBeUndefined();
  });
});

// ---- submissionReadiness -----------------------------------------------

describe('submissionReadiness.VALID_*', () => {
  it('exposes the artifact-kind + status whitelists', () => {
    expect(submissionReadiness.VALID_KINDS).toEqual(expect.arrayContaining([
      'capability_statement', 'past_performance', 'staffing_plan',
      'pricing_table', 'compliance_matrix', 'attachment', 'other',
    ]));
    expect(submissionReadiness.VALID_STATUSES).toEqual([
      'missing', 'in_progress', 'ready', 'reviewed',
    ]);
  });
});

describe('submissionReadiness.DEFAULT_TEMPLATE', () => {
  it('includes the 5 standard required artifacts', () => {
    const kinds = submissionReadiness.DEFAULT_TEMPLATE.map((t) => t.artifactKind);
    expect(kinds).toEqual(expect.arrayContaining([
      'capability_statement', 'past_performance', 'staffing_plan',
      'pricing_table', 'compliance_matrix',
    ]));
    expect(submissionReadiness.DEFAULT_TEMPLATE.every((t) => t.required === true)).toBe(true);
  });
});
