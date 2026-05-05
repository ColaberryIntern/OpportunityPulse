// v6 billing enforcement integration — verifies that gated services
// throw PlanLimitExceededError when org is at limit + enforce=true.

const mockOutputs = [];
let mockNextId = 1;

jest.mock('../../src/models', () => {
  const mockUsage = [];
  const mockOrgs = new Map([[1, { id: 1, planTier: 'basic' }]]);
  const opp = { id: 100, title: 'Test bid', value: 50000, category: 'IT Services' };
  return {
    sequelize: {},
    Opportunity: { findByPk: jest.fn(async (id) => (Number(id) === 100 ? opp : null)) },
    OpportunityOutput: {
      create: jest.fn(async (rec) => {
        const row = { ...rec, id: mockNextId++, toJSON() { return { ...this }; } };
        mockOutputs.push(row);
        return row;
      }),
      findAll: jest.fn(async () => []),
      findByPk: jest.fn(async (id) => mockOutputs.find((o) => o.id === Number(id)) || null),
      findAndCountAll: jest.fn(async () => ({ rows: [], count: 0 })),
    },
    OrganizationProfile: { findOne: jest.fn(async () => null) },
    UserProfile: { findOne: jest.fn(async () => null) },
    User: {
      findByPk: jest.fn(async (id) => (id ? { id, organizationId: 1 } : null)),
    },
    Organization: {
      findByPk: jest.fn(async (id) => mockOrgs.get(id) || null),
    },
    UsageMetric: {
      create: jest.fn(async (row) => {
        const r = { ...row, id: mockUsage.length + 1, createdAt: new Date() };
        mockUsage.push(r);
        return { ...r, toJSON: () => r };
      }),
      findAll: jest.fn(async ({ where = {} } = {}) => {
        let rows = mockUsage.slice();
        if (where.metricName) rows = rows.filter((r) => r.metricName === where.metricName);
        if (where.organizationId !== undefined) {
          rows = rows.filter((r) => r.organizationId === where.organizationId);
        }
        return rows.map((r) => ({ ...r, toJSON: () => r }));
      }),
    },
    __mockUsage: mockUsage,
  };
});

jest.mock('../../src/analysis/ai.client', () => ({
  getAIClient: () => ({
    chat: jest.fn().mockResolvedValue({ content: '## Test proposal' }),
  }),
}));

const actions = require('../../src/oied/actionGenerator.service');
const billing = require('../../src/oied/billing.service');
const models = require('../../src/models');

beforeEach(() => {
  models.__mockUsage.length = 0;
  mockOutputs.length = 0;
  mockNextId = 1;
  delete process.env.OIED_BILLING_ENFORCE;
});

describe('v6 enforcement integration: actionGenerator + billing', () => {
  it('SPEC: throws PlanLimitExceededError when org is at basic limit + enforce=true', async () => {
    process.env.OIED_BILLING_ENFORCE = 'true';
    // Seed 50 proposals_generated (basic tier limit) for this month.
    const now = new Date();
    for (let i = 0; i < 50; i += 1) {
      models.__mockUsage.push({
        organizationId: 1, metricName: 'proposals_generated', count: 1,
        createdAt: new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0),
      });
    }
    await expect(actions.generateOutput({
      opportunityId: 100, type: 'proposal', generatedBy: 1, userId: 1,
    })).rejects.toThrow(billing.PlanLimitExceededError);
  });

  it('does NOT throw when enforce=false even at over-limit', async () => {
    process.env.OIED_BILLING_ENFORCE = 'false';
    const now = new Date();
    for (let i = 0; i < 100; i += 1) {
      models.__mockUsage.push({
        organizationId: 1, metricName: 'proposals_generated', count: 1,
        createdAt: new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0),
      });
    }
    const out = await actions.generateOutput({
      opportunityId: 100, type: 'proposal', generatedBy: 1, userId: 1,
    });
    expect(out.id).toBeGreaterThan(0);
  });

  it('PlanLimitExceededError carries metric/used/limit/tier for the controller', async () => {
    process.env.OIED_BILLING_ENFORCE = 'true';
    for (let i = 0; i < 50; i += 1) {
      models.__mockUsage.push({
        organizationId: 1, metricName: 'proposals_generated', count: 1,
        createdAt: new Date(),
      });
    }
    let caught;
    try {
      await actions.generateOutput({
        opportunityId: 100, type: 'proposal', generatedBy: 1, userId: 1,
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(billing.PlanLimitExceededError);
    expect(caught.metric).toBe('proposals_generated');
    expect(caught.used).toBe(50);
    expect(caught.limit).toBe(50);
    expect(caught.tier).toBe('basic');
    expect(caught.statusCode).toBe(402);
  });

  it('non-proposal types ride free past the proposal limit', async () => {
    process.env.OIED_BILLING_ENFORCE = 'true';
    for (let i = 0; i < 100; i += 1) {
      models.__mockUsage.push({
        organizationId: 1, metricName: 'proposals_generated', count: 1,
        createdAt: new Date(),
      });
    }
    // 'analysis' is not gated — should succeed.
    const out = await actions.generateOutput({
      opportunityId: 100, type: 'analysis', generatedBy: 1, userId: 1,
    });
    expect(out.id).toBeGreaterThan(0);
  });
});
