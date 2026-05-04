// Integration test for the OIED action flow:
//   generate -> appears in review queue -> approve -> status updates
//
// Uses jest mocks for the AI client + the data layer so the test runs without
// a live DB (matches the bonfire upsert test pattern).

const mockOutputs = [];
let mockNextId = 1;

jest.mock('../../src/models', () => {
  const opp = { id: 100, title: 'Test bid', value: 50000, category: 'IT Services' };
  return {
    sequelize: {},
    Opportunity: {
      findByPk: jest.fn(async (id) => (Number(id) === 100 ? opp : null)),
    },
    OpportunityOutput: {
      create: jest.fn(async (rec) => {
        const row = { ...rec, id: mockNextId++, toJSON() { return { ...this }; }, save: jest.fn() };
        mockOutputs.push(row);
        return row;
      }),
      findByPk: jest.fn(async (id) => mockOutputs.find((o) => o.id === Number(id)) || null),
      findAndCountAll: jest.fn(async ({ where = {}, limit, offset } = {}) => {
        let rows = mockOutputs.slice();
        if (where.status) rows = rows.filter((r) => r.status === where.status);
        if (where.type) rows = rows.filter((r) => r.type === where.type);
        const total = rows.length;
        const start = offset || 0;
        return { rows: rows.slice(start, start + (limit || 50)), count: total };
      }),
      // v3: pastWins.service.getRecentApproved calls findAll on this model.
      findAll: jest.fn(async ({ where = {}, limit } = {}) => {
        let rows = mockOutputs.slice();
        if (where.status) rows = rows.filter((r) => r.status === where.status);
        if (where.type) rows = rows.filter((r) => r.type === where.type);
        return rows.slice(0, limit || 5);
      }),
    },
    OpportunityFitScore: { findOne: jest.fn(), upsert: jest.fn() },
    OpportunityEvent: {
      create: jest.fn(async (rec) => ({ ...rec, id: 1 })),
    },
    // v4: profile.service.getOrDefault hits OrganizationProfile.findOne
    // (renamed from UserProfile in 20260506000001-oied-v4-multitenant).
    // We expose both names because some legacy paths still reach for
    // UserProfile.
    UserProfile: {
      findOne: jest.fn(async () => null),
    },
    OrganizationProfile: {
      findOne: jest.fn(async () => null),
    },
    // v4: profile.service.resolveOrgId calls User.findByPk to derive org.
    User: {
      findByPk: jest.fn(async (id) => (id ? { id, organizationId: 1 } : null)),
    },
  };
});

jest.mock('../../src/analysis/ai.client', () => ({
  getAIClient: () => ({
    chat: jest.fn().mockResolvedValue({
      content: '## Executive Summary\nA test proposal.\n\n## Approach\nDo the work.',
    }),
  }),
}));

const actions = require('../../src/oied/actionGenerator.service');

describe('OIED action flow integration', () => {
  beforeEach(() => {
    mockOutputs.length = 0;
    mockNextId = 1;
  });

  it('generate -> appears in review queue (status=draft)', async () => {
    const out = await actions.generateOutput({
      opportunityId: 100,
      type: 'proposal',
      generatedBy: 7,
    });
    expect(out.status).toBe('draft');
    expect(out.type).toBe('proposal');
    expect(out.content).toContain('Executive Summary');

    const { rows, total } = await actions.listOutputs({ status: 'draft' });
    expect(total).toBe(1);
    expect(rows[0].id).toBe(out.id);
  });

  it('approve -> status moves to approved + reviewedAt set', async () => {
    const out = await actions.generateOutput({ opportunityId: 100, type: 'offer' });
    expect(out.status).toBe('draft');

    const updated = await actions.updateOutputStatus(out.id, {
      status: 'approved',
      reviewerId: 9,
    });
    expect(updated.status).toBe('approved');
    expect(updated.reviewerId).toBe(9);
    expect(updated.reviewedAt).toBeInstanceOf(Date);
  });

  it('reject -> status moves to rejected with notes preserved', async () => {
    const out = await actions.generateOutput({ opportunityId: 100, type: 'analysis' });
    const updated = await actions.updateOutputStatus(out.id, {
      status: 'rejected',
      reviewNotes: 'Off-brand pricing',
    });
    expect(updated.status).toBe('rejected');
    expect(updated.reviewNotes).toBe('Off-brand pricing');
  });

  it('edit (no status change) updates content and stamps an edited event upstream', async () => {
    const out = await actions.generateOutput({ opportunityId: 100, type: 'proposal' });
    const updated = await actions.updateOutputStatus(out.id, {
      content: '## Executive Summary\nEdited body.',
    });
    expect(updated.status).toBe('draft');
    expect(updated.content).toContain('Edited body');
  });

  it('rejects unknown output types at the boundary', async () => {
    await expect(
      actions.generateOutput({ opportunityId: 100, type: 'rfi' })
    ).rejects.toThrow(/Unknown output type/);
  });

  it('rejects unknown status transitions', async () => {
    const out = await actions.generateOutput({ opportunityId: 100, type: 'offer' });
    await expect(
      actions.updateOutputStatus(out.id, { status: 'archived' })
    ).rejects.toThrow(/Unknown status/);
  });
});
