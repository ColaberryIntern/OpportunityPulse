// v0.1 Submission Readiness — Bonfire readiness service tests.
// Mocks the Sequelize models + the document.service.activeTypeMap call.

jest.mock('../../src/models', () => ({
  sequelize: {},
  BonfireOpportunity: { findByPk: jest.fn(), findAll: jest.fn() },
  Document: {},
}));
jest.mock('../../src/documents/document.service', () => ({
  activeTypeMap: jest.fn(),
}));
jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
}));

const { BonfireOpportunity } = require('../../src/models');
const docSvc = require('../../src/documents/document.service');
const svc = require('../../src/bonfire/bonfireReadiness.service');

function makeOpp(overrides = {}) {
  return Object.assign({
    id: 'opp-1',
    title: 'Sample Bonfire RFP',
    description: 'Standard procurement opportunity',
    rawText: '',
    overview: '',
    agency: 'DHA Texas',
  }, overrides);
}

beforeEach(() => {
  BonfireOpportunity.findByPk.mockReset();
  BonfireOpportunity.findAll.mockReset();
  docSvc.activeTypeMap.mockReset();
});

describe('bonfireReadiness.detectConditional', () => {
  it('flags MWBE/DBE when text mentions MWBE preference', () => {
    const out = svc.detectConditional({ description: 'MWBE-certified vendors preferred', title: '', rawText: '' });
    expect(out.find((r) => r.type === 'cert_mwbe_dbe')).toBeTruthy();
  });
  it('flags MWBE/DBE for "minority-owned" phrasing', () => {
    const out = svc.detectConditional({ description: 'Open to minority-owned vendors', title: '', rawText: '' });
    expect(out.find((r) => r.type === 'cert_mwbe_dbe')).toBeTruthy();
  });
  it('does not flag MWBE when text is generic', () => {
    const out = svc.detectConditional({ description: 'Workforce assessment platform', title: 'AI Pilot', rawText: '' });
    expect(out.find((r) => r.type === 'cert_mwbe_dbe')).toBeFalsy();
  });
});

describe('bonfireReadiness.computeReadiness', () => {
  it('returns 100% when every required type has an active vault doc', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp());
    const now = new Date();
    docSvc.activeTypeMap.mockResolvedValue(new Map([
      ['cover_letter_template',         { id: 'd1', name: 'Cover',     version: 1, expires_at: null }],
      ['capability_statement',          { id: 'd2', name: 'CapStmt',   version: 1, expires_at: null }],
      ['coi',                           { id: 'd3', name: 'COI 2026',  version: 1, expires_at: new Date(now.getTime() + 365 * 86_400_000) }],
      ['references',                    { id: 'd4', name: 'Refs',      version: 1, expires_at: null }],
      ['technical_response_template',   { id: 'd5', name: 'TechResp',  version: 1, expires_at: null }],
      ['pricing_response_template',     { id: 'd6', name: 'Pricing',   version: 1, expires_at: null }],
    ]));
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    expect(out.completion_pct).toBe(100);
    expect(out.counts.satisfied).toBe(6);
    expect(out.counts.gaps).toBe(0);
    expect(out.checklist).toHaveLength(6);
  });

  it('drops the percentage when docs are missing', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp());
    docSvc.activeTypeMap.mockResolvedValue(new Map([
      ['cover_letter_template', { id: 'd1', name: 'Cover', version: 1, expires_at: null }],
      ['capability_statement',  { id: 'd2', name: 'Cap',   version: 1, expires_at: null }],
    ]));
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    // 2 of 6 satisfied → 33%
    expect(out.completion_pct).toBe(33);
    expect(out.counts.satisfied).toBe(2);
    expect(out.counts.gaps).toBe(4);
  });

  it('marks expired docs as expired (not satisfied)', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp());
    const past = new Date(Date.now() - 10 * 86_400_000);
    docSvc.activeTypeMap.mockResolvedValue(new Map([
      ['coi', { id: 'd1', name: 'COI', version: 1, expires_at: past }],
    ]));
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    const coi = out.checklist.find((c) => c.type === 'coi');
    expect(coi.status).toBe('expired');
    expect(out.counts.expired).toBe(1);
  });

  it('marks docs expiring within 30d as expiring', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp());
    const soon = new Date(Date.now() + 10 * 86_400_000);
    docSvc.activeTypeMap.mockResolvedValue(new Map([
      ['coi', { id: 'd1', name: 'COI', version: 1, expires_at: soon }],
    ]));
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    const coi = out.checklist.find((c) => c.type === 'coi');
    expect(coi.status).toBe('expiring');
    expect(out.counts.expiring).toBe(1);
  });

  it('adds MWBE cert to required list when opp text mentions it', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp({ description: 'MWBE preference applies' }));
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    expect(out.counts.total).toBe(7); // 6 always-required + 1 MWBE
    expect(out.checklist.find((c) => c.type === 'cert_mwbe_dbe')).toBeTruthy();
  });

  it('throws NOT_FOUND when opp does not exist', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(null);
    await expect(svc.computeReadiness({ opportunityId: 'missing', organizationId: 1 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('bonfireReadiness.computeReadinessSummaries', () => {
  it('returns one summary per opp keyed by id', async () => {
    BonfireOpportunity.findAll.mockResolvedValue([
      makeOpp({ id: 'opp-1' }),
      makeOpp({ id: 'opp-2', description: 'minority-owned vendors welcome' }),
    ]);
    docSvc.activeTypeMap.mockResolvedValue(new Map([
      ['cover_letter_template', { id: 'd1', name: 'C', version: 1, expires_at: null }],
      ['capability_statement',  { id: 'd2', name: 'C', version: 1, expires_at: null }],
      ['coi',                   { id: 'd3', name: 'C', version: 1, expires_at: null }],
    ]));
    const out = await svc.computeReadinessSummaries({ opportunityIds: ['opp-1', 'opp-2'], organizationId: 1 });
    expect(out['opp-1'].total).toBe(6);
    expect(out['opp-1'].satisfied).toBe(3);
    expect(out['opp-2'].total).toBe(7); // MWBE added
    expect(out['opp-2'].satisfied).toBe(3);
  });
});
