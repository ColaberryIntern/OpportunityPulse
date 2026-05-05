// Pure-function tests for the intelligence envelope. No DB mocking
// required — the helpers take pre-loaded rows and return JSON.

const ctx = require('../../src/oied/intelligence.context');

function fakeOpp(over = {}) {
  return {
    id: over.id || 1,
    title: over.title || 'Test RFP',
    bucket: over.bucket || 'standard',
    value: over.value != null ? over.value : 250_000,
    fitScore: over.fitScore != null ? over.fitScore : 60,
    priorityScore: over.priorityScore != null ? over.priorityScore : 50,
    urgency: over.urgency != null ? over.urgency : 65,
    winProbability: over.winProbability != null ? over.winProbability : 0.30,
    aiAnalysis: { recommended_product: 'X', automation_potential: 50 },
    description: 'short',
    effortEstimate: over.effortEstimate || { proposal_hours: 6, build_days: 14, effort_score: 40 },
  };
}

function fakeBundle(over = {}) {
  return {
    id: over.id || 100,
    theme: over.theme || 'Test bundle',
    opportunityCount: over.opportunityCount || 6,
    estimatedTotalValue: over.estimatedTotalValue != null ? over.estimatedTotalValue : 5_000_000,
    strategy: over.strategy != null ? over.strategy : {},
    blueprint: over.blueprint != null ? over.blueprint : {},
    organizationId: 1,
    ...over,
  };
}

describe('intelligence.context — opportunity envelope', () => {
  it('returns all 9 standardized fields plus schema_version', () => {
    const out = ctx.buildContextForOpportunity({ opp: fakeOpp() });
    const required = [
      'schema_version', 'priority', 'value', 'win_probability', 'effort',
      'roi_per_hour', 'recommended_action', 'reason', 'strategic_type',
      'next_steps', 'organization_id', 'generated_at',
    ];
    for (const k of required) {
      expect(out).toHaveProperty(k);
    }
    expect(out.schema_version).toBe(1);
  });

  it('roi_per_hour = value × win_probability / proposal_hours', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp({ value: 600_000, winProbability: 0.5,
        effortEstimate: { proposal_hours: 6, build_days: 14, effort_score: 40 } }),
    });
    // 600_000 × 0.5 / 6 = 50,000
    expect(out.roi_per_hour).toBe(50_000);
  });

  it('act_now bucket recommends generate_proposal when no draft exists', () => {
    const out = ctx.buildContextForOpportunity({ opp: fakeOpp({ bucket: 'act_now' }) });
    expect(out.recommended_action).toBe('generate_proposal');
    expect(out.strategic_type).toBe('act_now_opportunity');
    expect(out.next_steps[0]).toMatch(/generate/);
  });

  it('act_now with existing draft → review_draft', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp({ bucket: 'act_now' }),
      latestDraft: { status: 'draft', id: 5 },
    });
    expect(out.recommended_action).toBe('review_draft');
  });

  it('approved draft → mark_submitted with concrete next step', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp({ bucket: 'high_value' }),
      latestDraft: { status: 'approved', id: 5 },
    });
    expect(out.recommended_action).toBe('mark_submitted');
    expect(out.next_steps[0]).toMatch(/mark-result.*submitted/);
  });

  it('won outcome → archive_won', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp(), outcome: 'won',
    });
    expect(out.recommended_action).toBe('archive_won');
    expect(out.strategic_type).toBe('won_opportunity');
  });

  it('lost outcome → archive_lost (calibration signal)', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp(), outcome: 'lost',
    });
    expect(out.recommended_action).toBe('archive_lost');
    expect(out.reason).toMatch(/calibration/);
  });

  it('submitted_pending recent → await_response', () => {
    const out = ctx.buildContextForOpportunity({
      opp: { ...fakeOpp(), _submittedDaysAgo: 5 },
      outcome: 'submitted_pending',
    });
    expect(out.recommended_action).toBe('await_response');
  });

  it('submitted_pending stale (>14d) → mark_outcome', () => {
    const out = ctx.buildContextForOpportunity({
      opp: { ...fakeOpp(), _submittedDaysAgo: 21 },
      outcome: 'submitted_pending',
    });
    expect(out.recommended_action).toBe('mark_outcome');
  });

  it('low fit + standard bucket → skip', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp({ bucket: 'standard', fitScore: 15 }),
    });
    expect(out.recommended_action).toBe('skip');
    expect(out.strategic_type).toBe('skippable_opportunity');
  });

  it('medium fit + standard → monitor', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp({ bucket: 'standard', fitScore: 60 }),
    });
    expect(out.recommended_action).toBe('monitor');
  });

  it('falls back to baseline win_probability when none provided', () => {
    const out = ctx.buildContextForOpportunity({
      opp: { ...fakeOpp(), winProbability: undefined },
    });
    expect(out.win_probability).toBeCloseTo(0.20, 2);
  });
});

describe('intelligence.context — bundle envelope', () => {
  it('returns the standardized fields with null win_probability', () => {
    const out = ctx.buildContextForBundle({ bundle: fakeBundle() });
    expect(out.schema_version).toBe(1);
    expect(out.win_probability).toBeNull();
    expect(out.roi_per_hour).toBeNull();
  });

  it('no strategy → recommend generate_strategy', () => {
    const out = ctx.buildContextForBundle({ bundle: fakeBundle() });
    expect(out.recommended_action).toBe('generate_strategy');
    expect(out.next_steps[0]).toMatch(/strategy/);
  });

  it('strategy but no blueprint → generate_blueprint', () => {
    const out = ctx.buildContextForBundle({
      bundle: fakeBundle({ strategy: { what_to_build: 'X' } }),
    });
    expect(out.recommended_action).toBe('generate_blueprint');
  });

  it('blueprint but no plan → generate_execution_plan', () => {
    const out = ctx.buildContextForBundle({
      bundle: fakeBundle({
        strategy: { what_to_build: 'X' },
        blueprint: { mvp_scope: 'Y' },
      }),
    });
    expect(out.recommended_action).toBe('generate_execution_plan');
  });

  it('plan in draft → start_build', () => {
    const out = ctx.buildContextForBundle({
      bundle: fakeBundle({
        strategy: { what_to_build: 'X' },
        blueprint: { mvp_scope: 'Y' },
      }),
      plan: { status: 'draft' },
    });
    expect(out.recommended_action).toBe('start_build');
    expect(out.next_steps[0]).toMatch(/execution-plan\/start/);
  });

  it('plan in_progress → execute_tasks + strategic_type=in_progress_build', () => {
    const out = ctx.buildContextForBundle({
      bundle: fakeBundle({ strategy: { what_to_build: 'X' }, blueprint: { mvp_scope: 'Y' } }),
      plan: { status: 'in_progress' },
    });
    expect(out.recommended_action).toBe('execute_tasks');
    expect(out.strategic_type).toBe('in_progress_build');
  });

  it('plan completed → archive_build', () => {
    const out = ctx.buildContextForBundle({
      bundle: fakeBundle({ strategy: { what_to_build: 'X' }, blueprint: { mvp_scope: 'Y' } }),
      plan: { status: 'completed' },
    });
    expect(out.recommended_action).toBe('archive_build');
  });

  it('high-value bundle (>$10M) → strategic_type=high_value_bundle', () => {
    const out = ctx.buildContextForBundle({
      bundle: fakeBundle({ estimatedTotalValue: 50_000_000 }),
    });
    expect(out.strategic_type).toBe('high_value_bundle');
  });

  it('priority scales with value + member count', () => {
    const small = ctx.buildContextForBundle({
      bundle: fakeBundle({ estimatedTotalValue: 100_000, opportunityCount: 3 }),
    });
    const big = ctx.buildContextForBundle({
      bundle: fakeBundle({ estimatedTotalValue: 200_000_000, opportunityCount: 50 }),
    });
    expect(big.priority).toBeGreaterThan(small.priority);
    expect(big.priority).toBeLessThanOrEqual(100);
  });

  it('next_steps is non-empty for any state', () => {
    for (const stage of [
      { strategy: {}, blueprint: {} },
      { strategy: { what_to_build: 'X' }, blueprint: {} },
      { strategy: { what_to_build: 'X' }, blueprint: { mvp_scope: 'Y' } },
    ]) {
      const out = ctx.buildContextForBundle({ bundle: fakeBundle(stage) });
      expect(Array.isArray(out.next_steps)).toBe(true);
      expect(out.next_steps.length).toBeGreaterThan(0);
    }
  });
});

describe('intelligence.context.ROUTES — central registry prevents URL rot', () => {
  it('exposes the API call sketches used by next_steps', () => {
    expect(ctx.ROUTES.generate(42)).toMatch(/\/opportunities\/42\/generate$/);
    expect(ctx.ROUTES.markResult(42)).toMatch(/\/opportunities\/42\/mark-result$/);
    expect(ctx.ROUTES.bundleExecStart(7)).toMatch(/\/bundles\/7\/execution-plan\/start$/);
  });
});
