// v0.1 Submission Readiness — Bonfire readiness service tests.
// Mocks the Sequelize models + the document.service.activeTypeMap call.

jest.mock('../../src/models', () => ({
  sequelize: {},
  BonfireOpportunity: { findByPk: jest.fn(), findAll: jest.fn() },
  OpportunityAttachment: { count: jest.fn() },
  Document: {},
}));
jest.mock('../../src/documents/document.service', () => ({
  activeTypeMap: jest.fn(),
}));
jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
}));

const { BonfireOpportunity, OpportunityAttachment } = require('../../src/models');
const docSvc = require('../../src/documents/document.service');
const svc = require('../../src/bonfire/bonfireReadiness.service');

// v0.8: tests assume the opp is in the "tailored" state by default — pursuit
// is on, attachments are present, AI has run against them. Tests for the
// upstream gates live in their own describe block below.
function makeOpp(overrides = {}) {
  return Object.assign({
    id: 'opp-1',
    title: 'Sample Bonfire RFP',
    description: 'Standard procurement opportunity',
    rawText: '',
    overview: '',
    agency: 'DHA Texas',
    pursuitStatus: 'pursuing',
    pursuedAt: new Date(),
    submissionRequirements: {
      generated_at: new Date().toISOString(),
      attachment_count: 3,
    },
  }, overrides);
}

beforeEach(() => {
  BonfireOpportunity.findByPk.mockReset();
  BonfireOpportunity.findAll.mockReset();
  OpportunityAttachment.count.mockReset();
  // Default to "attachments present" so the legacy tests still see the
  // tailored state path. State-gate tests override this.
  OpportunityAttachment.count.mockResolvedValue(3);
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

describe('bonfireReadiness.computeReadiness — v0.2 AI merge', () => {
  it('merges AI additional_required into the checklist with source=ai', async () => {
    const opp = makeOpp({
      submissionRequirements: {
        generated_at: new Date().toISOString(),
        model_used: 'gpt-4o-mini',
        attachment_count: 3,
        baseline_types: ['cover_letter_template'],
        additional_required: [
          { type: 'cert_bid_bond', confidence: 0.9, reason: 'Bid bond ≥ 5%', source_quote: 'Bid bond of 5% required.' },
          { type: 'eeo_statement', confidence: 0.4, reason: 'Maybe', source_quote: 'EEO mentioned' },
        ],
        summary: 'Construction RFP — bonding required.',
      },
    });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    // 6 baseline + 1 AI (eeo dropped under 0.5 threshold)
    expect(out.counts.total).toBe(7);
    const bidBond = out.checklist.find((c) => c.type === 'cert_bid_bond');
    expect(bidBond).toBeTruthy();
    expect(bidBond.source).toBe('ai');
    expect(bidBond.source_quote).toBe('Bid bond of 5% required.');
    expect(out.ai).toBeTruthy();
    expect(out.ai.summary).toMatch(/Construction RFP/);
  });

  it('returns ai=null when no submission_requirements have been generated (in tailored state)', async () => {
    // To reach tailored state without submissionRequirements is impossible by
    // design; this test verifies the guard's strictness — when AI hasn't run,
    // state goes to attachments-only and the response shape is the envelope,
    // not the full checklist.
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp({ submissionRequirements: null }));
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    expect(out.state).toBe('attachments-only');
    expect(out.completion_pct).toBeNull();
    expect(out.ai).toBeNull();
  });

  it('does not double-count when AI flags a type the regex-conditional already added', async () => {
    const opp = makeOpp({
      description: 'MWBE preference applies',
      submissionRequirements: {
        generated_at: new Date().toISOString(),
        attachment_count: 3,
        additional_required: [
          { type: 'cert_mwbe_dbe', confidence: 0.9, reason: 'MWBE preference', source_quote: 'MWBE-certified vendors preferred' },
        ],
      },
    });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    // 6 baseline + 1 MWBE (from AI, takes precedence over regex)
    expect(out.counts.total).toBe(7);
    const mwbe = out.checklist.find((c) => c.type === 'cert_mwbe_dbe');
    expect(mwbe.source).toBe('ai');
  });
});

describe('bonfireReadiness.computeReadinessSummaries', () => {
  it('returns numbers when AI has tailored against attachments', async () => {
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
    expect(out['opp-1'].ai_tailored).toBe(true);
    expect(out['opp-2'].total).toBe(7); // MWBE added
    expect(out['opp-2'].satisfied).toBe(3);
  });

  it('returns null fields (no misleading %) when AI has not tailored against attachments', async () => {
    // Bare opp — pursuit none, no submissionRequirements.
    BonfireOpportunity.findAll.mockResolvedValue([
      { id: 'opp-1', title: 't', description: 'd', rawText: '', overview: '', submissionRequirements: null, pursuitStatus: 'none' },
    ]);
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadinessSummaries({ opportunityIds: ['opp-1'], organizationId: 1 });
    expect(out['opp-1'].pursuit_status).toBe('none');
    expect(out['opp-1'].completion_pct).toBeNull();
    expect(out['opp-1'].satisfied).toBeNull();
    expect(out['opp-1'].ai_tailored).toBe(false);
  });
});

// v0.8 — state machine gates the readiness compute. Each upstream gate
// produces a different envelope; the panel renders four distinct UIs.
describe('bonfireReadiness.computeReadiness — v0.8 state gating', () => {
  it('returns state=pre-pursuit + null % when pursuit_status is "none"', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp({ pursuitStatus: 'none' }));
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    expect(out.state).toBe('pre-pursuit');
    expect(out.completion_pct).toBeNull();
    expect(out.checklist).toEqual([]);
    expect(out.pursuit.status).toBe('none');
  });

  it('returns state=pursuing-no-attachments when intent set but no attachments yet', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp({
      pursuitStatus: 'pursuing', submissionRequirements: null,
    }));
    OpportunityAttachment.count.mockResolvedValue(0);
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    expect(out.state).toBe('pursuing-no-attachments');
    expect(out.completion_pct).toBeNull();
    expect(out.attachments.count).toBe(0);
  });

  it('returns state=attachments-only when files present but AI not run', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp({
      pursuitStatus: 'pursuing', submissionRequirements: null,
    }));
    OpportunityAttachment.count.mockResolvedValue(4);
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    expect(out.state).toBe('attachments-only');
    expect(out.completion_pct).toBeNull();
    expect(out.attachments.count).toBe(4);
  });

  it('returns state=attachments-only when AI ran but had no attachments to read', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp({
      pursuitStatus: 'pursuing',
      submissionRequirements: { generated_at: new Date().toISOString(), attachment_count: 0 },
    }));
    OpportunityAttachment.count.mockResolvedValue(2);
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    // AI ran on metadata only — not enough to graduate to "tailored."
    expect(out.state).toBe('attachments-only');
  });

  it('returns state=submitted for terminal status', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(makeOpp({ pursuitStatus: 'submitted' }));
    docSvc.activeTypeMap.mockResolvedValue(new Map());
    const out = await svc.computeReadiness({ opportunityId: 'opp-1', organizationId: 1 });
    expect(out.state).toBe('submitted');
  });
});
