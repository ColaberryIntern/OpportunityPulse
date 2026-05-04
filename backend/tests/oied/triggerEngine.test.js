// Trigger engine — verifies pure rule matching + the orchestrated
// runTriggers flow with mocked My Opps + bundles + generators.

jest.mock('../../src/models', () => {
  const mockTriggerLogs = [];
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
      findAndCountAll: jest.fn(async () => ({ rows: mockTriggerLogs.slice(), count: mockTriggerLogs.length })),
    },
    __mockTriggerLogs: mockTriggerLogs,
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
