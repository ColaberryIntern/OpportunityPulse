// Billing service — instrumentation safety, monthly window math,
// tier enforcement, plan-tier change.

jest.mock('../../src/models', () => {
  const mockUsage = [];
  const mockOrgs = new Map();
  return {
    sequelize: {},
    UsageMetric: {
      create: jest.fn(async (row) => {
        const r = { ...row, id: mockUsage.length + 1, createdAt: row.createdAt || new Date() };
        mockUsage.push(r);
        return { ...r, toJSON: () => r };
      }),
      findAll: jest.fn(async ({ where = {} } = {}) => {
        let rows = mockUsage.slice();
        if (where.organizationId !== undefined) {
          rows = rows.filter((r) => r.organizationId === where.organizationId);
        }
        if (where.metricName) rows = rows.filter((r) => r.metricName === where.metricName);
        if (where.createdAt) {
          // Op.gte stub: assume it's the value we passed in the second key.
          const op = Object.getOwnPropertySymbols(where.createdAt)[0];
          if (op) {
            const since = where.createdAt[op];
            rows = rows.filter((r) => new Date(r.createdAt) >= since);
          }
        }
        return rows.map((r) => ({ ...r, toJSON: () => r }));
      }),
    },
    Organization: {
      findByPk: jest.fn(async (id) => {
        if (!mockOrgs.has(id)) return null;
        const row = { ...mockOrgs.get(id) };
        row.save = async function save() {
          mockOrgs.set(id, { ...this });
          return this;
        };
        row.toJSON = function toJSON() {
          // Reflect the current state of the proxy row, not the snapshot
          // captured when findByPk was called.
          const { save: _s, toJSON: _t, ...rest } = this;
          return rest;
        };
        return row;
      }),
    },
    __mock: { mockUsage, mockOrgs },
  };
});

const billing = require('../../src/oied/billing.service');
const models = require('../../src/models');

beforeEach(() => {
  models.__mock.mockUsage.length = 0;
  models.__mock.mockOrgs.clear();
  models.UsageMetric.create.mockClear();
  delete process.env.OIED_BILLING_ENFORCE;
});

describe('billing.recordUsage', () => {
  it('writes a row + returns the persisted snapshot', async () => {
    const out = await billing.recordUsage({
      organizationId: 1, metric: 'proposals_generated', count: 1,
      metadata: { outputId: 7 },
    });
    expect(models.UsageMetric.create).toHaveBeenCalled();
    expect(out.metricName).toBe('proposals_generated');
    expect(out.metadata.outputId).toBe(7);
  });

  it('does NOT throw when persistence fails (instrumentation safety)', async () => {
    models.UsageMetric.create.mockRejectedValueOnce(new Error('db gone'));
    const out = await billing.recordUsage({ organizationId: 1, metric: 'proposals_generated' });
    expect(out).toBeNull();
  });

  it('returns null + warns when no metric supplied', async () => {
    const out = await billing.recordUsage({ organizationId: 1 });
    expect(out).toBeNull();
    expect(models.UsageMetric.create).not.toHaveBeenCalled();
  });
});

describe('billing.getUsageThisMonth', () => {
  it('counts only current-month rows', async () => {
    const now = new Date('2026-05-15T12:00:00Z');
    // Two rows this month, one row last month.
    models.__mock.mockUsage.push(
      { organizationId: 1, metricName: 'proposals_generated', count: 1, createdAt: new Date('2026-05-01T00:00:00Z') },
      { organizationId: 1, metricName: 'proposals_generated', count: 1, createdAt: new Date('2026-05-14T00:00:00Z') },
      { organizationId: 1, metricName: 'proposals_generated', count: 1, createdAt: new Date('2026-04-30T00:00:00Z') },
    );
    const used = await billing.getUsageThisMonth({
      organizationId: 1, metric: 'proposals_generated', now,
    });
    expect(used).toBe(2);
  });

  it('sums the count column (not just row count)', async () => {
    const now = new Date('2026-05-15T12:00:00Z');
    models.__mock.mockUsage.push(
      { organizationId: 1, metricName: 'briefings_sent', count: 3, createdAt: new Date('2026-05-01') },
      { organizationId: 1, metricName: 'briefings_sent', count: 2, createdAt: new Date('2026-05-10') },
    );
    const used = await billing.getUsageThisMonth({
      organizationId: 1, metric: 'briefings_sent', now,
    });
    expect(used).toBe(5);
  });
});

describe('billing.checkPlanLimit (math)', () => {
  beforeEach(() => {
    models.__mock.mockOrgs.set(1, { id: 1, planTier: 'basic' });
  });

  it('basic tier proposals_generated limit = 50', async () => {
    const status = await billing.checkPlanLimit({
      organizationId: 1, metric: 'proposals_generated',
    });
    expect(status.tier).toBe('basic');
    expect(status.limit).toBe(50);
    expect(status.used).toBe(0);
    expect(status.remaining).toBe(50);
    expect(status.exceeded).toBe(false);
  });

  it('exceeded=true when used >= limit', async () => {
    const now = new Date('2026-05-15T12:00:00Z');
    for (let i = 0; i < 50; i += 1) {
      models.__mock.mockUsage.push({
        organizationId: 1, metricName: 'proposals_generated', count: 1,
        createdAt: new Date('2026-05-10'),
      });
    }
    const status = await billing.checkPlanLimit({
      organizationId: 1, metric: 'proposals_generated', now,
    });
    expect(status.used).toBe(50);
    expect(status.remaining).toBe(0);
    expect(status.exceeded).toBe(true);
  });

  it('enterprise tier returns -1 limit and Infinity remaining', async () => {
    models.__mock.mockOrgs.set(1, { id: 1, planTier: 'enterprise' });
    const status = await billing.checkPlanLimit({
      organizationId: 1, metric: 'proposals_generated',
    });
    expect(status.limit).toBe(-1);
    expect(status.remaining).toBe(Infinity);
    expect(status.exceeded).toBe(false);
  });

  it('unknown tier falls back to basic limits', () => {
    expect(billing.getPlanLimits('asdf')).toEqual(billing.PLAN_LIMITS.basic);
  });
});

describe('billing.enforceOrThrow (gate)', () => {
  beforeEach(() => {
    models.__mock.mockOrgs.set(1, { id: 1, planTier: 'basic' });
    const now = new Date('2026-05-15');
    for (let i = 0; i < 60; i += 1) {
      models.__mock.mockUsage.push({
        organizationId: 1, metricName: 'proposals_generated', count: 1, createdAt: new Date('2026-05-10'),
      });
    }
  });

  it('does NOT throw at over-limit when OIED_BILLING_ENFORCE=false', async () => {
    process.env.OIED_BILLING_ENFORCE = 'false';
    const status = await billing.enforceOrThrow({
      organizationId: 1, metric: 'proposals_generated',
      now: new Date('2026-05-15'),
    });
    expect(status.exceeded).toBe(true);
    expect(status.enforcing).toBe(false);
  });

  it('throws PlanLimitExceededError at over-limit when enforce=true', async () => {
    process.env.OIED_BILLING_ENFORCE = 'true';
    await expect(billing.enforceOrThrow({
      organizationId: 1, metric: 'proposals_generated',
      now: new Date('2026-05-15'),
    })).rejects.toThrow(/plan limit exceeded/);
  });

  it('does NOT throw when used is below limit even with enforce=true', async () => {
    process.env.OIED_BILLING_ENFORCE = 'true';
    models.__mock.mockUsage.length = 0; // reset
    const status = await billing.enforceOrThrow({
      organizationId: 1, metric: 'proposals_generated',
      now: new Date('2026-05-15'),
    });
    expect(status.used).toBe(0);
    expect(status.exceeded).toBe(false);
  });
});

describe('billing.changePlanTier', () => {
  it('flips the planTier on the organization', async () => {
    models.__mock.mockOrgs.set(1, { id: 1, planTier: 'basic' });
    const out = await billing.changePlanTier({ organizationId: 1, tier: 'enterprise' });
    expect(out.planTier).toBe('enterprise');
    expect(models.__mock.mockOrgs.get(1).planTier).toBe('enterprise');
  });

  it('rejects unknown tiers', async () => {
    models.__mock.mockOrgs.set(1, { id: 1, planTier: 'basic' });
    await expect(billing.changePlanTier({ organizationId: 1, tier: 'platinum' }))
      .rejects.toThrow(/unknown tier/);
  });
});

describe('billing.getUsageSummary', () => {
  it('returns a row per metric with limit + remaining', async () => {
    models.__mock.mockOrgs.set(1, { id: 1, planTier: 'basic' });
    const summary = await billing.getUsageSummary({ organizationId: 1 });
    expect(summary.tier).toBe('basic');
    expect(summary.metrics.proposals_generated.limit).toBe(50);
    expect(summary.metrics.briefings_sent.limit).toBe(30);
  });
});
