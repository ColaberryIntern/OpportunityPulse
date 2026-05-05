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

  it('approved draft → mark_submitted with /mark-submitted next step (v7.1)', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp({ bucket: 'high_value' }),
      latestDraft: { status: 'approved', id: 5 },
    });
    expect(out.recommended_action).toBe('mark_submitted');
    // v7.1: dedicated /mark-submitted endpoint, not mark-result.
    expect(out.next_steps[0]).toMatch(/\/mark-submitted/);
    expect(out.strategic_type).toBe('awaiting_review');
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

  // ---------- v7.1 lifecycle fixes ----------

  it('v7.1 SPEC: ?d ago bug fixed — _submittedDaysAgo=0 renders as "0d", not "?d"', () => {
    const out = ctx.buildContextForOpportunity({
      opp: { ...fakeOpp(), _submittedDaysAgo: 0 },
      outcome: 'submitted_no_response',
    });
    expect(out.reason).toMatch(/submitted 0d ago/);
    expect(out.reason).not.toMatch(/\?d ago/);
  });

  it('v7.1: undefined _submittedDaysAgo still falls back to ?', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp(), // no _submittedDaysAgo
      outcome: 'submitted_no_response',
    });
    expect(out.reason).toMatch(/submitted \?d ago/);
  });

  it('v7.1 NEW: latestDraft.status=draft → strategic_type=awaiting_review', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp({ bucket: 'standard' }),
      latestDraft: { status: 'draft', id: 5 },
    });
    expect(out.recommended_action).toBe('review_draft');
    expect(out.strategic_type).toBe('awaiting_review');
    expect(out.next_steps[1]).toMatch(/\/mark-submitted/);
  });

  it('v7.1 NEW: outcome=submitted_no_response (≤14d) → await_response', () => {
    const out = ctx.buildContextForOpportunity({
      opp: { ...fakeOpp(), _submittedDaysAgo: 5 },
      outcome: 'submitted_no_response',
    });
    expect(out.recommended_action).toBe('await_response');
    expect(out.strategic_type).toBe('pending_outcome_opportunity');
    expect(out.next_steps[0]).toMatch(/mark-result.*responded/);
  });

  it('v7.1 NEW: outcome=submitted_no_response stale (>14d) → mark_outcome', () => {
    const out = ctx.buildContextForOpportunity({
      opp: { ...fakeOpp(), _submittedDaysAgo: 21 },
      outcome: 'submitted_no_response',
    });
    expect(out.recommended_action).toBe('mark_outcome');
  });

  it('v7.1 NEW: outcome=responded_no_outcome → mark_outcome with won/lost steps', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp(),
      outcome: 'responded_no_outcome',
    });
    expect(out.recommended_action).toBe('mark_outcome');
    expect(out.strategic_type).toBe('pending_outcome_opportunity');
    expect(out.reason).toMatch(/buyer responded/);
    // Concrete next steps: won OR lost.
    expect(out.next_steps.some((s) => /\\?"status\\?":\\?"won\\?"/.test(s) || s.includes('"status":"won"'))).toBe(true);
  });

  it('v7.1: no draft + bucket=act_now → generate_proposal (lifecycle fallback)', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp({ bucket: 'act_now' }),
      latestDraft: null,
      outcome: null,
    });
    expect(out.recommended_action).toBe('generate_proposal');
    expect(out.strategic_type).toBe('act_now_opportunity');
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

// ---------- v8: grounding sub-object on the envelope ----------

describe('intelligence.context — v8 grounding sub-object', () => {
  it('omits ctx.grounding when no grounding payload is passed (list endpoints)', () => {
    const out = ctx.buildContextForOpportunity({ opp: fakeOpp() });
    expect(out.grounding).toBeUndefined();
    // Schema version stays at 1 — grounding is purely additive.
    expect(out.schema_version).toBe(1);
  });

  it('attaches agency_name + solicitation_id + empty missing_fields when grounding ok', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp(),
      grounding: {
        status: 'ok',
        agency_name: 'City of Austin',
        solicitation_id: 'RFP-2026-007',
        scope_summary: 'A reasonably long scope summary describing what the buyer needs in this procurement.',
      },
    });
    expect(out.grounding).toEqual({
      agency_name: 'City of Austin',
      solicitation_id: 'RFP-2026-007',
      missing_fields: [],
    });
  });

  it('reports missing_fields when a required derivation came back null', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp(),
      grounding: {
        status: 'ok',
        agency_name: null,
        solicitation_id: 'RFP-2026-007',
        scope_summary: 'A reasonably long scope summary describing what the buyer needs in this procurement.',
      },
    });
    expect(out.grounding.missing_fields).toContain('agency_name');
  });

  it('flags invalid_stage with blocked_by_event when lifecycle gate hit', () => {
    const out = ctx.buildContextForOpportunity({
      opp: fakeOpp(),
      grounding: {
        status: 'invalid_stage',
        event_type: 'submitted',
        opportunity_id: 1,
      },
    });
    expect(out.grounding.status).toBe('invalid_stage');
    expect(out.grounding.blocked_by_event).toBe('submitted');
  });
});
