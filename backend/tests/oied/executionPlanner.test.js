// Execution planner — keyword mapping, timeline math, persistence,
// startBuild flow.

jest.mock('../../src/models', () => {
  const mockBundles = new Map();
  const mockPlans = new Map(); // bundleId → row
  return {
    sequelize: {},
    Bundle: {
      findByPk: jest.fn(async (id) => {
        if (!mockBundles.has(id)) return null;
        return mockBundles.get(id);
      }),
    },
    ExecutionPlan: {
      findOne: jest.fn(async ({ where: { bundleId } }) => {
        if (!mockPlans.has(bundleId)) return null;
        const row = mockPlans.get(bundleId);
        return {
          ...row,
          save: async function save() { mockPlans.set(bundleId, { ...this }); return this; },
          toJSON() { const { save: _s, toJSON: _t, ...rest } = this; return rest; },
        };
      }),
      findAll: jest.fn(async ({ where = {} } = {}) => {
        const rows = [...mockPlans.values()];
        return rows
          .filter((r) => !where.organizationId || r.organizationId === where.organizationId)
          .map((r) => ({ ...r, toJSON: () => r }));
      }),
      create: jest.fn(async (row) => {
        const r = { ...row, id: mockPlans.size + 1, createdAt: new Date(), updatedAt: new Date() };
        mockPlans.set(row.bundleId, r);
        return {
          ...r,
          save: async function save() { mockPlans.set(row.bundleId, { ...this }); return this; },
          toJSON() { const { save: _s, toJSON: _t, ...rest } = this; return rest; },
        };
      }),
    },
    __mock: { mockBundles, mockPlans },
  };
});

jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
}));

const ep = require('../../src/oied/executionPlanner.service');
const models = require('../../src/models');

const FROZEN_NOW = new Date('2026-05-15T12:00:00Z');

const SAMPLE_BLUEPRINT = {
  mvp_scope: 'Single-tenant deployment for one anchor agency by week 8.',
  features: [
    'Real-time data integration from military and federal sources',
    'AI-driven predictive analytics for resource allocation',
    'User-friendly dashboard for decision-makers',
    'Customizable reporting tools for various departments',
    'Secure access controls and compliance tracking',
    'Machine learning models for threat assessment',
  ],
  required_agents: ['AI/ML Engineer', 'Data Engineer', 'Frontend Engineer', 'Compliance Lead'],
  time_to_market_weeks: 12,
};

beforeEach(() => {
  models.__mock.mockBundles.clear();
  models.__mock.mockPlans.clear();
  models.Bundle.findByPk.mockClear();
  models.ExecutionPlan.create.mockClear();
});

describe('executionPlanner.pickAgentForFeature (keyword map)', () => {
  it('data/integration → Data Engineer', () => {
    expect(ep.pickAgentForFeature('Real-time data integration', ['AI/ML Engineer', 'Data Engineer']))
      .toBe('Data Engineer');
  });
  it('ml/predict → AI/ML Engineer', () => {
    expect(ep.pickAgentForFeature('Machine learning models for threat assessment', ['AI/ML Engineer']))
      .toBe('AI/ML Engineer');
  });
  it('dashboard/UI → Frontend Engineer', () => {
    expect(ep.pickAgentForFeature('User-friendly dashboard for decision-makers', ['Frontend Engineer']))
      .toBe('Frontend Engineer');
  });
  it('compliance/secure → Compliance Lead', () => {
    expect(ep.pickAgentForFeature('Secure access controls and compliance tracking', ['Compliance Lead']))
      .toBe('Compliance Lead');
  });
  it('api/backend → Backend Engineer', () => {
    // No data/etl/pipeline keyword — purely backend.
    expect(ep.pickAgentForFeature('REST API service for auth and job queue', ['Backend Engineer']))
      .toBe('Backend Engineer');
  });
  it('falls back to first required_agent when no keyword matches', () => {
    expect(ep.pickAgentForFeature('Custom feature with no keyword', ['AI Pilot Lead', 'Data Engineer']))
      .toBe('AI Pilot Lead');
  });
});

describe('executionPlanner.orderFeatures', () => {
  it('data/infra first, dashboard/UI last', () => {
    const ordered = ep.orderFeatures([
      'User-friendly dashboard',
      'Real-time data integration',
      'Custom reporting tool',
      'ETL pipeline',
    ]);
    // data/etl tasks first, dashboard/reporting last.
    expect(ordered[0]).toMatch(/data integration|ETL pipeline/i);
    expect(ordered[ordered.length - 1]).toMatch(/dashboard|reporting/i);
  });
});

describe('executionPlanner.buildPlanFromBlueprint (pure)', () => {
  it('SPEC: blueprint generates execution tasks', () => {
    const out = ep.buildPlanFromBlueprint(SAMPLE_BLUEPRINT, { now: FROZEN_NOW });
    expect(out.tasks).toHaveLength(6);
    // Cumulative offsets sum to total_days (last task absorbs remainder).
    expect(out.timeline.total_days).toBe(84); // 12 weeks
    const lastTask = out.tasks[out.tasks.length - 1];
    expect(lastTask.start_offset_days + lastTask.estimated_days).toBe(84);
    // Each task has a non-empty assigned_agent.
    for (const t of out.tasks) {
      expect(t.assigned_agent).toBeTruthy();
      expect(t.estimated_days).toBeGreaterThan(0);
    }
  });

  it('throws when blueprint has no mvp_scope', () => {
    expect(() => ep.buildPlanFromBlueprint({ features: ['x'] })).toThrow(/mvp_scope/);
  });

  it('falls back to mvp_scope as a single task when features is empty', () => {
    const out = ep.buildPlanFromBlueprint({
      mvp_scope: 'Lone deliverable',
      features: [],
      required_agents: ['Solo'],
      time_to_market_weeks: 4,
    });
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0].title).toBe('Lone deliverable');
    expect(out.tasks[0].estimated_days).toBe(28);
  });

  it('assigned_agents has unique-in-order set actually used', () => {
    const out = ep.buildPlanFromBlueprint(SAMPLE_BLUEPRINT, { now: FROZEN_NOW });
    expect(out.assigned_agents.length).toBeGreaterThan(0);
    expect(new Set(out.assigned_agents).size).toBe(out.assigned_agents.length); // unique
  });
});

describe('executionPlanner.generateExecutionPlan (DB-bound)', () => {
  function seedBundle({ id = 1, blueprint = SAMPLE_BLUEPRINT } = {}) {
    models.__mock.mockBundles.set(id, {
      id, theme: 'Test bundle', blueprint, organizationId: 1,
    });
  }

  it('first run creates a draft plan + persists', async () => {
    seedBundle();
    const out = await ep.generateExecutionPlan(1, { organizationId: 1, now: FROZEN_NOW });
    expect(out.cached).toBe(false);
    expect(out.plan.tasks).toHaveLength(6);
    expect(out.plan.status).toBe('draft');
    expect(models.__mock.mockPlans.get(1)).toBeTruthy();
  });

  it('second run hits cache without re-creating', async () => {
    seedBundle();
    await ep.generateExecutionPlan(1, { organizationId: 1, now: FROZEN_NOW });
    models.ExecutionPlan.create.mockClear();
    const out = await ep.generateExecutionPlan(1, { organizationId: 1, now: FROZEN_NOW });
    expect(out.cached).toBe(true);
    expect(models.ExecutionPlan.create).not.toHaveBeenCalled();
  });

  it('force=true bypasses cache + updates the existing row', async () => {
    seedBundle();
    await ep.generateExecutionPlan(1, { organizationId: 1, now: FROZEN_NOW });
    const out = await ep.generateExecutionPlan(1, { organizationId: 1, force: true, now: FROZEN_NOW });
    expect(out.cached).toBe(false);
    // Still only one plan row.
    expect(models.__mock.mockPlans.size).toBe(1);
  });

  it('throws when bundle has no blueprint', async () => {
    models.__mock.mockBundles.set(1, { id: 1, theme: 'X', blueprint: {}, organizationId: 1 });
    await expect(ep.generateExecutionPlan(1, { organizationId: 1 }))
      .rejects.toThrow(/no blueprint/);
  });
});

describe('executionPlanner.startBuild', () => {
  beforeEach(async () => {
    models.__mock.mockBundles.set(1, {
      id: 1, theme: 'X', blueprint: SAMPLE_BLUEPRINT, organizationId: 1,
    });
    await ep.generateExecutionPlan(1, { organizationId: 1, now: FROZEN_NOW });
  });

  it('flips status to in_progress and stamps started_at', async () => {
    const out = await ep.startBuild(1, { now: FROZEN_NOW });
    expect(out.alreadyStarted).toBe(false);
    expect(out.plan.status).toBe('in_progress');
    expect(out.plan.startedAt).toBeTruthy();
  });

  it('returns alreadyStarted=true on second call', async () => {
    await ep.startBuild(1, { now: FROZEN_NOW });
    const out2 = await ep.startBuild(1, { now: FROZEN_NOW });
    expect(out2.alreadyStarted).toBe(true);
  });

  it('throws when there is no plan to start', async () => {
    models.__mock.mockPlans.clear();
    await expect(ep.startBuild(1)).rejects.toThrow(/no execution plan/);
  });
});
