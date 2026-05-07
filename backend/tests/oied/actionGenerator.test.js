// Light prompt-assembly + metadata tests. The full integration path
// (DB write) is covered by actionFlow.integration.test.js — here we
// just verify the v3 enrichments wire up.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Opportunity: { findByPk: jest.fn() },
  OpportunityOutput: { create: jest.fn(async (row) => ({ ...row, id: 999, toJSON: () => ({ ...row, id: 999 }) })) },
}));

jest.mock('../../src/oied/profile.service', () => ({
  getOrDefault: jest.fn(async () => ({
    services: ['ai-systems', 'data-analytics'],
    industries: ['IT Services'],
    tools: [],
    pastWins: ['DHA compliance audit'],
    minDealSize: 10000,
    riskTolerance: 'medium',
    preferences: {},
  })),
  // v5: actionGenerator now calls resolveOrgId before recording usage.
  resolveOrgId: jest.fn(async () => 1),
}));

// v5: actionGenerator records usage. Mock the billing service so the
// test doesn't try to write to the (mocked) UsageMetric model.
// v6 adds enforceOrThrow which gates the AI call.
jest.mock('../../src/oied/billing.service', () => ({
  recordUsage: jest.fn(async () => null),
  enforceOrThrow: jest.fn(async () => ({
    metric: 'proposals_generated', tier: 'enterprise',
    used: 0, limit: -1, remaining: Infinity, exceeded: false, enforcing: false,
  })),
}));

jest.mock('../../src/oied/pastWins.service', () => ({
  getRecentApproved: jest.fn(async () => [
    {
      id: 7, type: 'proposal', content: 'Past proposal text about data analytics platforms.',
      reviewedAt: new Date(), opportunity: { id: 100, title: 'Old Win', category: 'IT Services', value: 50000 },
    },
  ]),
}));

jest.mock('../../src/analysis/ai.client', () => {
  const client = {
    chat: jest.fn(async () => ({
      content: 'A draft proposal mentioning data-analytics, ai-systems, and IT Services workflows.',
    })),
  };
  return { getAIClient: () => client, __client: client };
});

const {
  generateOutput,
  scorePersonalization,
  buildUserPrompt,
  COLABERRY_POSITIONING,
} = require('../../src/oied/actionGenerator.service');
const { Opportunity, OpportunityOutput } = require('../../src/models');
const aiMod = require('../../src/analysis/ai.client');

// v8: TEST_OPP carries enough metadata for the grounding service to
// derive agency_name + solicitation_id + scope_summary so the generator
// can run end-to-end. (Pre-v8 tests didn't need this — the gate didn't exist.)
const TEST_OPP = {
  id: 42, title: 'AI Data Analytics RFP-2026-007', category: 'IT Services',
  value: 250000, location: 'City of Austin', source: 'sam.gov',
  sourceId: 'sam:RFP-2026-007',
  description: 'Need a data analytics platform with AI components for the City of Austin. The RFP requires a statement of work, pricing schedule, and compliance section. Bidders should propose technologies that meet our integration needs.',
  aiAnalysis: { ai_category: 'IT Services', recommended_product: 'OpsBot', signals: [] },
  sourceData: { agency: 'City of Austin', external_id: 'sam:RFP-2026-007' },
};

beforeEach(() => {
  Opportunity.findByPk.mockResolvedValue(TEST_OPP);
  OpportunityOutput.create.mockClear();
});

describe('actionGenerator.scorePersonalization', () => {
  it('returns 0 with empty profile + empty content', () => {
    expect(scorePersonalization({ userProfile: {}, pastWins: [], content: '' })).toBe(0);
  });
  it('rewards token overlap with profile services', () => {
    const score = scorePersonalization({
      userProfile: { services: ['data-analytics', 'staffing'], industries: ['Compliance'] },
      pastWins: [],
      content: 'We provide data-analytics and compliance audit work.',
    });
    expect(score).toBeGreaterThan(0);
  });
  it('saturates at 100', () => {
    const tokens = Array.from({ length: 30 }, (_, i) => `token${i}xyz`);
    const score = scorePersonalization({
      userProfile: { services: tokens, industries: [], tools: [], pastWins: [] },
      pastWins: [],
      content: tokens.join(' '),
    });
    expect(score).toBe(100);
  });
});

describe('actionGenerator.buildUserPrompt', () => {
  it('embeds the user profile services + past wins block when both present', () => {
    const prompt = buildUserPrompt(
      TEST_OPP,
      { services: ['ai-systems'], industries: ['IT Services'], pastWins: ['DHA audit'], tools: [] },
      [{ type: 'proposal', content: 'Prior win text', opportunity: { title: 'X', category: 'IT', value: 100 } }],
    );
    expect(prompt).toMatch(/services: ai-systems/);
    expect(prompt).toMatch(/industries we serve: IT Services/);
    expect(prompt).toMatch(/Last 1 approved proposal\(s\)/);
  });
  it('omits the profile block when no profile passed', () => {
    const prompt = buildUserPrompt(TEST_OPP, null, []);
    expect(prompt).not.toMatch(/Our company profile/);
  });
});

describe('actionGenerator.generateOutput (v3 metadata)', () => {
  it('appends COLABERRY_POSITIONING to the system prompt', async () => {
    await generateOutput({ opportunityId: 42, type: 'proposal', generatedBy: 1 });
    const client = aiMod.__client;
    expect(client.chat).toHaveBeenCalled();
    const [sys] = client.chat.mock.calls[client.chat.mock.calls.length - 1];
    expect(sys).toContain(COLABERRY_POSITIONING.trim().slice(0, 50));
  });

  it('persists metadata.template_used + personalization_score + colaberry_positioning', async () => {
    await generateOutput({ opportunityId: 42, type: 'proposal', generatedBy: 1 });
    const created = OpportunityOutput.create.mock.calls[0][0];
    // v8: grounded proposals are tagged proposal-v8.
    expect(created.metadata.template_used).toBe('proposal-v8');
    expect(created.metadata.colaberry_positioning).toBe(true);
    expect(typeof created.metadata.personalization_score).toBe('number');
    expect(created.metadata.personalization_score).toBeGreaterThan(0);
    expect(Array.isArray(created.metadata.past_wins_used)).toBe(true);
    expect(created.metadata.past_wins_used).toContain(7);
    expect(created.metadata.profile_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects unknown output types', async () => {
    await expect(
      generateOutput({ opportunityId: 42, type: 'novel', generatedBy: 1 })
    ).rejects.toThrow(/Unknown output type/);
  });

  it('accepts the v9.8.2 resume type and uses the resume system prompt', async () => {
    await generateOutput({ opportunityId: 42, type: 'resume', generatedBy: 1 });
    const client = aiMod.__client;
    const [sys] = client.chat.mock.calls[client.chat.mock.calls.length - 1];
    expect(sys).toMatch(/tailored resumes/i);
    const created = OpportunityOutput.create.mock.calls[OpportunityOutput.create.mock.calls.length - 1][0];
    expect(created.type).toBe('resume');
  });
});

// ---------- v8: Grounded proposal generation ----------

const { MissingGroundingError, buildGroundedUserPrompt, HARD_RULES } = require('../../src/oied/actionGenerator.service');
const events = require('../../src/oied/events.service');
const groundingSvc = require('../../src/oied/grounding.service');

describe('actionGenerator v8 — grounded proposal flow', () => {
  beforeEach(() => {
    Opportunity.findByPk.mockResolvedValue(TEST_OPP);
    OpportunityOutput.create.mockClear();
    aiMod.__client.chat.mockClear();
    aiMod.__client.chat.mockResolvedValue({
      content: 'A proposal for City of Austin RFP-2026-007 covering data-analytics scope.',
    });
  });

  it('SPEC: valid stage + grounding ok → proposal generates with metadata.grounding', async () => {
    await generateOutput({ opportunityId: 42, type: 'proposal', generatedBy: 1 });
    const created = OpportunityOutput.create.mock.calls[0][0];
    expect(created.metadata.template_used).toBe('proposal-v8');
    expect(created.metadata.grounding).toEqual(expect.objectContaining({
      agency_name: 'City of Austin',
      solicitation_id: expect.any(String),
    }));
    expect(created.metadata.banned_terms_detected).toEqual([]);
  });

  it('SPEC: submitted event exists → throws LifecycleViolationError', async () => {
    // Patch grounding directly to simulate the lifecycle gate hitting.
    const original = groundingSvc.getOpportunityGrounding;
    groundingSvc.getOpportunityGrounding = jest.fn(async () => ({
      status: 'invalid_stage',
      message: 'Proposal generation not allowed at this lifecycle stage',
      event_type: 'submitted',
      opportunity_id: 42,
    }));
    let caught;
    try {
      await generateOutput({ opportunityId: 42, type: 'proposal', generatedBy: 1 });
    } catch (e) { caught = e; }
    groundingSvc.getOpportunityGrounding = original;
    expect(caught).toBeInstanceOf(events.LifecycleViolationError);
    expect(caught.requires).toBe('submitted');
  });

  it('SPEC: missing agency → throws MissingGroundingError with missing_fields', async () => {
    const original = groundingSvc.getOpportunityGrounding;
    groundingSvc.getOpportunityGrounding = jest.fn(async () => ({
      status: 'ok',
      opportunity_id: 42,
      agency_name: null, // ← missing
      solicitation_id: 'X',
      opportunity_title: 'X',
      scope_summary: 'long enough scope summary describing what the buyer wants in the procurement.',
      submission_requirements: { required_sections: [], page_limit: null, format: null },
    }));
    let caught;
    try {
      await generateOutput({ opportunityId: 42, type: 'proposal', generatedBy: 1 });
    } catch (e) { caught = e; }
    groundingSvc.getOpportunityGrounding = original;
    expect(caught).toBeInstanceOf(MissingGroundingError);
    expect(caught.missing_fields).toContain('agency_name');
    expect(caught.statusCode).toBe(422);
  });

  it('SPEC: generated content references agency + solicitation_id, no banned terms', async () => {
    aiMod.__client.chat.mockResolvedValueOnce({
      content: '## Executive Summary\nThis proposal addresses City of Austin RFP-2026-007 with our AI Systems and Data Analytics services.',
    });
    await generateOutput({ opportunityId: 42, type: 'proposal', generatedBy: 1 });
    const created = OpportunityOutput.create.mock.calls[0][0];
    expect(created.content).toMatch(/City of Austin/);
    expect(created.content).toMatch(/RFP-2026-007/);
    expect(created.metadata.banned_terms_detected).toEqual([]);
  });

  it('banned term in output bumps personalization_score down + records the hit', async () => {
    aiMod.__client.chat.mockResolvedValueOnce({
      content: 'We propose StaffMatch for City of Austin RFP-2026-007.',
    });
    await generateOutput({ opportunityId: 42, type: 'proposal', generatedBy: 1 });
    const created = OpportunityOutput.create.mock.calls[0][0];
    expect(created.metadata.banned_terms_detected).toContain('StaffMatch');
    // Score is dampened by the −10 penalty per hit.
    expect(created.metadata.personalization_score).toBeLessThan(100);
  });

  it('hard rules + banned terms list appear in the system prompt', async () => {
    await generateOutput({ opportunityId: 42, type: 'proposal', generatedBy: 1 });
    const [systemPrompt] = aiMod.__client.chat.mock.calls[0];
    expect(systemPrompt).toMatch(/CRITICAL RULES/);
    expect(systemPrompt).toMatch(/DO NOT invent product names/);
    expect(systemPrompt).toMatch(/Banned terms.*StaffMatch/);
  });

  it('buildGroundedUserPrompt embeds Approved Services + Banned Terms blocks', () => {
    const prompt = buildGroundedUserPrompt(
      TEST_OPP,
      { services: [], industries: [], tools: [], pastWins: [] },
      [],
      {
        agency_name: 'City of Austin',
        solicitation_id: 'RFP-2026-007',
        opportunity_title: 'Test',
        scope_summary: 'scope',
        submission_requirements: { required_sections: ['sow', 'pricing'], page_limit: 25, format: 'PDF' },
      },
      {
        services: ['AI Systems', 'Data Analytics'],
        case_studies: ['DHA audit'],
        allowed_terms: ['AI Systems', 'Snowflake'],
        banned_terms: ['StaffMatch'],
      },
    );
    expect(prompt).toMatch(/Agency: City of Austin/);
    expect(prompt).toMatch(/Solicitation ID: RFP-2026-007/);
    expect(prompt).toMatch(/Approved Services.*AI Systems, Data Analytics/);
    expect(prompt).toMatch(/Banned Terms.*StaffMatch/);
    expect(prompt).toMatch(/Required Sections: sow, pricing/);
  });
});
