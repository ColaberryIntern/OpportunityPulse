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

const TEST_OPP = {
  id: 42, title: 'AI Data Analytics RFP', category: 'IT Services',
  value: 250000, location: 'Austin, TX', source: 'sam.gov',
  description: 'Need a data analytics platform with AI components.',
  aiAnalysis: { ai_category: 'IT Services', recommended_product: 'OpsBot', signals: [] },
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
    expect(created.metadata.template_used).toBe('proposal-v3');
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
});
