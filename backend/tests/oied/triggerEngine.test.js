// Trigger engine — verifies pure rule matching + the orchestrated
// runTriggers flow with mocked My Opps + bundles + generators.

jest.mock('../../src/models', () => {
  const mockTriggerLogs = [];
  const mockDrafts = new Map(); // outputId → row
  const mockEvents = [];
  return {
    sequelize: {},
    Bundle: { findAll: jest.fn(async () => []) },
    TriggerLog: {
      create: jest.fn(async (row) => {
        const r = { ...row, id: mockTriggerLogs.length + 1, createdAt: new Date() };
        mockTriggerLogs.push(r);
        return { ...r, toJSON: () => r };
      }),
      findOne: jest.fn(async () => null),
      findAll: jest.fn(async () => []), // v6: per-day cap counter
      findAndCountAll: jest.fn(async () => ({ rows: mockTriggerLogs.slice(), count: mockTriggerLogs.length })),
    },
    OpportunityOutput: {
      // v6: loadLatestDraft + auto_submit guardrail.
      findOne: jest.fn(async ({ where: { opportunityId } }) => {
        for (const row of mockDrafts.values()) {
          if (row.opportunityId === opportunityId && row.status === 'draft') return row;
        }
        return null;
      }),
      findByPk: jest.fn(async (id) => mockDrafts.get(id) || null),
    },
    OpportunityEvent: {
      // v6: auto_submit stamps a 'submitted' event.
      create: jest.fn(async (row) => {
        const r = { ...row, id: mockEvents.length + 1 };
        mockEvents.push(r);
        return r;
      }),
    },
    __mockTriggerLogs: mockTriggerLogs,
    __mockDrafts: mockDrafts,
    __mockEvents: mockEvents,
  };
});

jest.mock('../../src/oied/myOpportunities.service', () => ({
  listMyOpportunities: jest.fn(),
}));
jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
}));
jest.mock('../../src/oied/actionGenerator.service', () => ({
  generateOutput: jest.fn(async ({ opportunityId }) => ({
    id: 9000 + opportunityId, opportunityId, type: 'proposal',
  })),
}));
jest.mock('../../src/oied/opportunityBundler.service', () => ({
  generateBundleStrategy: jest.fn(async () => ({ cached: false, bundleId: 1 })),
}));

const tr = require('../../src/oied/triggerEngine.service');
const myOpps = require('../../src/oied/myOpportunities.service');
const actions = require('../../src/oied/actionGenerator.service');
const bundler = require('../../src/oied/opportunityBundler.service');
const models = require('../../src/models');

function fakeOpp(over = {}) {
  return {
    id: over.id || 1,
    title: over.title || 'X',
    bucket: over.bucket || 'act_now',
    value: over.value != null ? over.value : 50000,
    effortEstimate: { effort_score: over.effortScore != null ? over.effortScore : 25, proposal_hours: 4, build_days: 7 },
  };
}

beforeEach(() => {
  models.__mockTriggerLogs.length = 0;
  models.TriggerLog.create.mockClear();
  models.TriggerLog.findOne.mockReset().mockResolvedValue(null);
  models.Bundle.findAll.mockReset().mockResolvedValue([]);
  myOpps.listMyOpportunities.mockReset();
  actions.generateOutput.mockClear();
  bundler.generateBundleStrategy.mockClear();
});

describe('triggerEngine.matchOpportunity (rule logic)', () => {
  const proposalRule = tr.RULES.find((r) => r.name === 'auto_proposal_act_now');
  it('matches when act_now + effort<30 + value>5000', () => {
    expect(tr.matchOpportunity(proposalRule,
      { bucket: 'act_now', value: 6000 }, { effort_score: 25 })).toBe(true);
  });
  it('skips when value <= 5000', () => {
    expect(tr.matchOpportunity(proposalRule,
      { bucket: 'act_now', value: 5000 }, { effort_score: 25 })).toBe(false);
  });
  it('skips when effort >= 30', () => {
    expect(tr.matchOpportunity(proposalRule,
      { bucket: 'act_now', value: 50000 }, { effort_score: 30 })).toBe(false);
  });
  it('skips when bucket != act_now', () => {
    expect(tr.matchOpportunity(proposalRule,
      { bucket: 'standard', value: 50000 }, { effort_score: 25 })).toBe(false);
  });
});

describe('triggerEngine.matchBundle (rule logic)', () => {
  const bundleRule = tr.RULES.find((r) => r.name === 'auto_strategy_high_value_bundle');
  it('matches when bundle value > 10M', () => {
    expect(tr.matchBundle(bundleRule, { estimatedTotalValue: 12_000_000 })).toBe(true);
  });
  it('skips when bundle value <= 10M', () => {
    expect(tr.matchBundle(bundleRule, { estimatedTotalValue: 10_000_000 })).toBe(false);
  });
});

describe('triggerEngine.runTriggers (orchestration)', () => {
  it('fires generate_proposal on a matching opportunity', async () => {
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [fakeOpp({ id: 1, value: 50000, effortScore: 25 })], total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, userId: 1, dryRun: false });
    expect(out.fired).toBe(1);
    expect(actions.generateOutput).toHaveBeenCalledWith(expect.objectContaining({
      opportunityId: 1, type: 'proposal',
    }));
    const log = models.__mockTriggerLogs.find((l) => l.status === 'success');
    expect(log).toBeTruthy();
    expect(log.outputId).toBe(9001);
  });

  it('skips with reason=cooldown when a recent success exists', async () => {
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [fakeOpp({ id: 2 })], total: 1,
    });
    models.TriggerLog.findOne.mockResolvedValue({ id: 999, status: 'success' });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: false });
    expect(out.fired).toBe(0);
    expect(out.skipped).toBe(1);
    expect(actions.generateOutput).not.toHaveBeenCalled();
    const log = models.__mockTriggerLogs.find((l) => l.status === 'skipped');
    expect(log.reason).toBe('cooldown');
  });

  it('respects per-run cap (status=skipped, reason=daily_cap)', async () => {
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: Array.from({ length: 5 }, (_, i) => fakeOpp({ id: i + 10 })), total: 5,
    });
    const out = await tr.runTriggers({
      organizationId: 1, dryRun: false, maxProposals: 2, maxStrategies: 0,
    });
    expect(out.fired).toBe(2);
    expect(out.skipped).toBe(3);
    const skips = models.__mockTriggerLogs.filter((l) => l.status === 'skipped' && l.reason === 'daily_cap');
    expect(skips.length).toBe(3);
  });

  it('dryRun=true never invokes the generator + logs status=dry_run', async () => {
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [fakeOpp({ id: 50 })], total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: true });
    expect(out.dry_run_count).toBe(1);
    expect(out.fired).toBe(0);
    expect(actions.generateOutput).not.toHaveBeenCalled();
    expect(models.__mockTriggerLogs[0].status).toBe('dry_run');
  });

  it('fires generate_strategy on a high-value bundle', async () => {
    myOpps.listMyOpportunities.mockResolvedValue({ rows: [], total: 0 });
    models.Bundle.findAll.mockResolvedValue([{
      id: 100, theme: 'Big AI', estimatedTotalValue: 50_000_000,
      strategy: {}, // no strategy yet
      toJSON() { return { id: 100, estimatedTotalValue: 50_000_000, strategy: {} }; },
    }]);
    const out = await tr.runTriggers({ organizationId: 1, dryRun: false });
    expect(out.fired).toBe(1);
    expect(bundler.generateBundleStrategy).toHaveBeenCalledWith(100);
  });

  it('skips bundle when strategy is already cached', async () => {
    myOpps.listMyOpportunities.mockResolvedValue({ rows: [], total: 0 });
    models.Bundle.findAll.mockResolvedValue([{
      id: 101, theme: 'Cached', estimatedTotalValue: 50_000_000,
      strategy: { what_to_build: 'Already there' },
      toJSON() { return { id: 101, estimatedTotalValue: 50_000_000, strategy: { what_to_build: 'Already there' } }; },
    }]);
    const out = await tr.runTriggers({ organizationId: 1, dryRun: false });
    expect(out.fired).toBe(0);
    expect(out.skipped).toBe(1);
    expect(bundler.generateBundleStrategy).not.toHaveBeenCalled();
  });
});

// ---------- v6: Confidence-Based Auto Execution ----------

describe('triggerEngine v6.computeConfidenceScore (pure)', () => {
  it('high inputs near 1.0', () => {
    const score = tr.computeConfidenceScore({
      winProb: 0.85, effortScore: 10, personalization: 95,
    });
    expect(score).toBeGreaterThan(0.9);
  });
  it('low inputs near 0.0', () => {
    const score = tr.computeConfidenceScore({
      winProb: 0, effortScore: 100, personalization: 0,
    });
    expect(score).toBe(0);
  });
  it('weighted: win_prob has 50%, effort has 25%, personalization has 25%', () => {
    // Pure win-prob signal at perfect 0.85: contributes 0.5.
    const winOnly = tr.computeConfidenceScore({ winProb: 0.85, effortScore: 100, personalization: 0 });
    expect(winOnly).toBeCloseTo(0.5, 2);
  });
});

describe('triggerEngine v6.getActiveRules', () => {
  beforeEach(() => { delete process.env.OIED_AUTO_SUBMIT_ENABLED; });

  it('removes auto_submit rule when OIED_AUTO_SUBMIT_ENABLED=false (default)', () => {
    const rules = tr.getActiveRules();
    expect(rules.find((r) => r.name === 'auto_submit_high_confidence')).toBeUndefined();
  });

  it('includes auto_submit rule when OIED_AUTO_SUBMIT_ENABLED=true', () => {
    process.env.OIED_AUTO_SUBMIT_ENABLED = 'true';
    const rules = tr.getActiveRules();
    expect(rules.find((r) => r.name === 'auto_submit_high_confidence')).toBeTruthy();
  });
});

describe('triggerEngine v6.runTriggers (auto_submit flow)', () => {
  beforeEach(() => {
    delete process.env.OIED_AUTO_SUBMIT_ENABLED;
    models.__mockTriggerLogs.length = 0;
    models.__mockDrafts.clear();
    models.__mockEvents.length = 0;
    actions.generateOutput.mockClear();
    bundler.generateBundleStrategy.mockClear();
  });

  function seedDraft(opportunityId, { winProbability = 0.7, personalization = 70 } = {}) {
    const draft = {
      id: opportunityId * 10,
      opportunityId,
      status: 'draft',
      type: 'proposal',
      metadata: { personalization_score: personalization },
      createdAt: new Date(),
      win_probability: winProbability,
      // mock save() for the auto_submit guardrail path
      save: async function save() {
        models.__mockDrafts.set(this.id, this);
      },
    };
    models.__mockDrafts.set(draft.id, draft);
    return draft;
  }

  it('SPEC: auto_submit fires when all 3 thresholds are met', async () => {
    process.env.OIED_AUTO_SUBMIT_ENABLED = 'true';
    seedDraft(11, { winProbability: 0.7, personalization: 70 });
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [
        // bucket=standard so the v4 auto_proposal rule does NOT also fire.
        {
          ...fakeOpp({ id: 11, value: 50000, effortScore: 25 }),
          bucket: 'standard',
          winProbability: 0.7,
        },
      ],
      total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: false });
    expect(out.fired).toBe(1);
    const log = models.__mockTriggerLogs.find((l) => l.action === 'auto_submit' && l.status === 'success');
    expect(log).toBeTruthy();
    expect(log.confidenceScore).toBeGreaterThan(0);
    // Draft was patched to approved.
    const draft = models.__mockDrafts.get(110);
    expect(draft.status).toBe('approved');
    expect(draft.reviewNotes).toMatch(/Auto-submitted/);
    // 'submitted' event recorded.
    expect(models.__mockEvents.find((e) => e.eventType === 'submitted' && e.opportunityId === 11))
      .toBeTruthy();
  });

  it('skips auto_submit when win_prob <= 0.6', async () => {
    process.env.OIED_AUTO_SUBMIT_ENABLED = 'true';
    seedDraft(12, { winProbability: 0.5, personalization: 80 });
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [{ ...fakeOpp({ id: 12, effortScore: 20 }), bucket: 'standard', winProbability: 0.5 }],
      total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: false });
    expect(out.fired).toBe(0);
    expect(models.__mockDrafts.get(120).status).toBe('draft');
  });

  it('skips auto_submit when effort_score >= 35', async () => {
    process.env.OIED_AUTO_SUBMIT_ENABLED = 'true';
    seedDraft(13, { winProbability: 0.7, personalization: 80 });
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [{ ...fakeOpp({ id: 13, effortScore: 50 }), bucket: 'standard', winProbability: 0.7 }],
      total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: false });
    expect(out.fired).toBe(0);
  });

  it('skips auto_submit when personalization <= 60', async () => {
    process.env.OIED_AUTO_SUBMIT_ENABLED = 'true';
    seedDraft(14, { winProbability: 0.7, personalization: 50 });
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [{ ...fakeOpp({ id: 14, effortScore: 25 }), bucket: 'standard', winProbability: 0.7 }],
      total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: false });
    expect(out.fired).toBe(0);
  });

  it('OIED_AUTO_SUBMIT_ENABLED=false removes the rule entirely (no dry_run row)', async () => {
    delete process.env.OIED_AUTO_SUBMIT_ENABLED;
    seedDraft(15, { winProbability: 0.9, personalization: 95 });
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [{ ...fakeOpp({ id: 15, effortScore: 10 }), bucket: 'standard', winProbability: 0.9 }],
      total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: true });
    expect(out.dry_run_count).toBe(0);
    expect(models.__mockTriggerLogs.find((l) => l.action === 'auto_submit')).toBeUndefined();
  });

  it('dry_run logs auto_submit row with confidence_score but does not patch the draft', async () => {
    process.env.OIED_AUTO_SUBMIT_ENABLED = 'true';
    seedDraft(16, { winProbability: 0.7, personalization: 70 });
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [{ ...fakeOpp({ id: 16, effortScore: 20 }), bucket: 'standard', winProbability: 0.7 }],
      total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: true });
    expect(out.dry_run_count).toBe(1);
    expect(out.fired).toBe(0);
    const log = models.__mockTriggerLogs.find((l) => l.action === 'auto_submit');
    expect(log.status).toBe('dry_run');
    expect(log.confidenceScore).toBeGreaterThan(0);
    expect(models.__mockDrafts.get(160).status).toBe('draft'); // unchanged
  });

  it('per-day cap (3) blocks further fires', async () => {
    process.env.OIED_AUTO_SUBMIT_ENABLED = 'true';
    for (let i = 17; i < 22; i += 1) seedDraft(i, { winProbability: 0.7, personalization: 70 });
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [17, 18, 19, 20, 21].map((id) => ({
        ...fakeOpp({ id, effortScore: 20 }), bucket: 'standard', winProbability: 0.7,
      })),
      total: 5,
    });
    const out = await tr.runTriggers({
      organizationId: 1, dryRun: false, maxAutoSubmits: 3,
      // The other actions also have caps; set them low so they don't
      // crowd the cap counter for auto_submit.
      maxProposals: 0, maxStrategies: 0,
    });
    expect(out.fired).toBe(3);
    const skips = models.__mockTriggerLogs.filter(
      (l) => l.action === 'auto_submit' && l.status === 'skipped' && l.reason === 'daily_cap',
    );
    expect(skips.length).toBe(2);
  });

  it('hard guardrail: never auto_submit if the draft has been touched', async () => {
    process.env.OIED_AUTO_SUBMIT_ENABLED = 'true';
    const draft = seedDraft(30, { winProbability: 0.7, personalization: 80 });
    // Simulate a race: between the rule match and the patch, somebody
    // approved it manually.
    draft.status = 'approved';
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [{ ...fakeOpp({ id: 30, effortScore: 20 }), bucket: 'standard', winProbability: 0.7 }],
      total: 1,
    });
    const out = await tr.runTriggers({ organizationId: 1, dryRun: false });
    // No fire because the rule's `latestDraft` lookup re-reads draft-status
    // outputs only — the manually-approved row is skipped at lookup.
    expect(out.fired).toBe(0);
  });
});
