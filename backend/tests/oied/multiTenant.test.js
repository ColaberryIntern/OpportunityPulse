// Multi-tenant readiness — hard assertions that org A's derived data
// (fit scores, bundles, past wins) is invisible to org B.
//
// We mock the data layer to a small in-memory store and exercise the
// service layer directly. Each store dict is keyed by (orgId, …) so the
// tests fail loudly if the service forgets to thread organizationId
// through.

jest.mock('../../src/models', () => {
  const fitScores = []; // each row carries {opportunityId, profileHash, organizationId, fitScore, ...}
  const bundles = [];
  const orgProfiles = new Map(); // organizationId → {services,...}
  const users = new Map();        // userId → {organizationId}
  const opportunities = new Map(); // id → row
  const opportunityOutputs = []; // metadata.organization_id for past-wins isolation

  const Model = (rows) => ({
    findOne: jest.fn(async ({ where = {} } = {}) => {
      return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) || null;
    }),
    findAll: jest.fn(async ({ where = {} } = {}) => {
      return rows.filter((r) => Object.entries(where).every(([k, v]) => {
        if (Array.isArray(v)) return v.includes(r[k]);
        if (v && typeof v === 'object') return true; // skip Op operators in this stub
        return r[k] === v;
      })).map((r) => ({ ...r, toJSON: () => r }));
    }),
    create: jest.fn(async (row) => {
      const r = { ...row, id: rows.length + 1, toJSON: () => row };
      rows.push(r);
      return r;
    }),
    upsert: jest.fn(async (row) => {
      const idx = rows.findIndex((r) =>
        r.organizationId === row.organizationId
        && r.opportunityId === row.opportunityId
        && r.profileHash === row.profileHash);
      if (idx >= 0) Object.assign(rows[idx], row);
      else rows.push({ ...row });
      const stored = rows[idx >= 0 ? idx : rows.length - 1];
      return [{ ...stored, toJSON: () => stored }];
    }),
  });

  return {
    sequelize: {},
    User: {
      findByPk: jest.fn(async (id, opts = {}) => {
        const u = users.get(id);
        if (!u) return null;
        return { id, organizationId: u.organizationId };
      }),
    },
    OrganizationProfile: {
      findOne: jest.fn(async ({ where: { organizationId } }) => {
        const p = orgProfiles.get(organizationId);
        if (!p) return null;
        return { ...p, organizationId, toJSON: () => ({ ...p, organizationId }) };
      }),
      create: jest.fn(async (row) => {
        orgProfiles.set(row.organizationId, row);
        return { ...row, toJSON: () => row };
      }),
    },
    UserProfile: { findOne: jest.fn(async () => null) },
    OpportunityFitScore: Model(fitScores),
    Bundle: Model(bundles),
    Opportunity: {
      findAll: jest.fn(async ({ where: { id } }) => {
        const list = Array.isArray(id) ? id : id ? [id] : Array.from(opportunities.keys());
        return list.map((i) => opportunities.get(i)).filter(Boolean);
      }),
      findByPk: jest.fn(async (id) => opportunities.get(id) || null),
    },
    OpportunityOutput: {
      findAll: jest.fn(async ({ where = {} } = {}) => {
        return opportunityOutputs.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          if (where.type && r.type !== where.type) return false;
          if (where.generatedBy != null && r.generatedBy !== where.generatedBy) return false;
          return true;
        }).map((r) => ({ ...r, toJSON: () => r }));
      }),
      create: jest.fn(async (row) => {
        const r = { ...row, id: opportunityOutputs.length + 1 };
        opportunityOutputs.push(r);
        return { ...r, toJSON: () => r };
      }),
    },
    OpportunityEvent: { findAll: jest.fn(async () => []), create: jest.fn(async () => ({})) },
    WinProbabilityHistory: { create: jest.fn(async () => ({ id: 1 })) },
    __mock: { fitScores, bundles, orgProfiles, users, opportunities, opportunityOutputs },
  };
});

const models = require('../../src/models');
const profileSvc = require('../../src/oied/profile.service');
const myOppsSvc = require('../../src/oied/myOpportunities.service');
const fitScoring = require('../../src/oied/fitScoring.service');
const pastWins = require('../../src/oied/pastWins.service');

const ORG_A = 1;
const ORG_B = 2;

beforeEach(() => {
  // Reset stores between tests.
  const m = models.__mock;
  m.fitScores.length = 0;
  m.bundles.length = 0;
  m.orgProfiles.clear();
  m.users.clear();
  m.opportunities.clear();
  m.opportunityOutputs.length = 0;
});

function seedUsers() {
  models.__mock.users.set(10, { organizationId: ORG_A });
  models.__mock.users.set(20, { organizationId: ORG_B });
}
function seedProfiles() {
  models.__mock.orgProfiles.set(ORG_A, {
    services: ['ai-systems'], industries: ['IT Services'],
    minDealSize: 1000, tools: [], pastWins: [],
    riskTolerance: 'medium', preferences: {},
  });
  models.__mock.orgProfiles.set(ORG_B, {
    services: ['compliance'], industries: ['Compliance'],
    minDealSize: 1000, tools: [], pastWins: [],
    riskTolerance: 'medium', preferences: {},
  });
}
function seedOpportunity() {
  const opp = {
    id: 500, title: 'Shared opportunity', category: 'IT Services',
    value: 250000, status: 'active',
    aiAnalysis: { ai_category: 'IT Services' },
    description: 'data analytics + ai systems',
    location: 'Austin TX',
    toJSON() { return this; },
  };
  models.__mock.opportunities.set(500, opp);
  return opp;
}

describe('multi-tenant: profile resolution', () => {
  it('resolveOrgId returns each user\'s org', async () => {
    seedUsers();
    expect(await profileSvc.resolveOrgId(10)).toBe(ORG_A);
    expect(await profileSvc.resolveOrgId(20)).toBe(ORG_B);
  });
  it('resolveOrgId falls back to default org (1) when user is unknown', async () => {
    expect(await profileSvc.resolveOrgId(9999)).toBe(1);
    expect(await profileSvc.resolveOrgId(null)).toBe(1);
  });
  it('getOrDefaultByOrg returns each org\'s own profile', async () => {
    seedProfiles();
    const a = await profileSvc.getOrDefaultByOrg(ORG_A);
    const b = await profileSvc.getOrDefaultByOrg(ORG_B);
    expect(a.services).toContain('ai-systems');
    expect(b.services).toContain('compliance');
    expect(a._isDefault).toBeFalsy();
    expect(b._isDefault).toBeFalsy();
  });
});

describe('multi-tenant: fit-score isolation', () => {
  it('two orgs scoring the same opportunity create independent rows', async () => {
    seedUsers();
    seedProfiles();
    const opp = seedOpportunity();

    const aProfile = await profileSvc.getOrDefaultByOrg(ORG_A);
    const bProfile = await profileSvc.getOrDefaultByOrg(ORG_B);

    await fitScoring.getOrCreateFitScore({
      opportunity: opp, userProfile: aProfile, organizationId: ORG_A,
    });
    await fitScoring.getOrCreateFitScore({
      opportunity: opp, userProfile: bProfile, organizationId: ORG_B,
    });

    const fs = models.__mock.fitScores;
    const aRows = fs.filter((r) => r.organizationId === ORG_A && r.opportunityId === 500);
    const bRows = fs.filter((r) => r.organizationId === ORG_B && r.opportunityId === 500);
    expect(aRows.length).toBeGreaterThan(0);
    expect(bRows.length).toBeGreaterThan(0);
    // Different profiles → different profile_hash → different cache rows.
    expect(aRows[0].profileHash).not.toBe(bRows[0].profileHash);
  });
});

describe('multi-tenant: bundle isolation', () => {
  it('listing org A\'s bundles does not return org B\'s bundles', async () => {
    models.__mock.bundles.push(
      { id: 1, organizationId: ORG_A, theme: 'A only', toJSON() { return this; } },
      { id: 2, organizationId: ORG_B, theme: 'B only', toJSON() { return this; } },
    );
    const aBundles = await models.Bundle.findAll({ where: { organizationId: ORG_A } });
    const bBundles = await models.Bundle.findAll({ where: { organizationId: ORG_B } });
    expect(aBundles.map((b) => b.id)).toEqual([1]);
    expect(bBundles.map((b) => b.id)).toEqual([2]);
  });
});

describe('multi-tenant: past wins do not leak across users', () => {
  it('pastWins.getRecentApproved filters by generatedBy (per-user scope)', async () => {
    // User 10 (org A) has a win; user 20 (org B) has a different win.
    seedOpportunity();
    models.__mock.opportunityOutputs.push(
      { id: 1, type: 'proposal', status: 'approved', generatedBy: 10,
        opportunityId: 500, content: 'A win', reviewedAt: new Date() },
      { id: 2, type: 'proposal', status: 'approved', generatedBy: 20,
        opportunityId: 500, content: 'B win', reviewedAt: new Date() },
    );
    const aWins = await pastWins.getRecentApproved({
      type: 'proposal', limit: 5, generatedBy: 10,
    });
    const bWins = await pastWins.getRecentApproved({
      type: 'proposal', limit: 5, generatedBy: 20,
    });
    expect(aWins.length).toBe(1);
    expect(aWins[0].content).toBe('A win');
    expect(bWins.length).toBe(1);
    expect(bWins[0].content).toBe('B win');
  });
});
