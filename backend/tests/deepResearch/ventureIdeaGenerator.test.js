// Deep Research Intelligence Engine — ventureIdeaGenerator.service tests.

jest.mock('../../src/analysis/ai.client', () => {
  const client = { model: 'gpt-4o-mini', chat: jest.fn() };
  return { getAIClient: () => client, __client: client };
});

const aiMod = require('../../src/analysis/ai.client');
const svc = require('../../src/deepResearch/ventureIdeaGenerator.service');

beforeEach(() => { aiMod.__client.chat.mockReset(); });

const context = {
  searchTerm: 'AI agents',
  totals: { sourceCount: 12, channelCount: 3 },
  channels: [{ label: 'Research', count: 5 }, { label: 'Government', count: 7 }],
};
const synthesis = {
  executive_summary: 'Agents are hot.',
  market_stage: 'emerging',
  confidence_score: 0.7,
  build_recommendation: 'Build now.',
  monetization_strategy: 'SaaS.',
  government_alignment: 'Strong public-sector pull.',
  opportunity_signals: ['6 demand links'],
  suggested_mvps: ['memory SDK'],
};

describe('ventureIdeaGenerator.buildUserPrompt', () => {
  it('includes the topic, scope, and the strategist synthesis', () => {
    const prompt = svc.buildUserPrompt(context, synthesis);
    expect(prompt).toMatch(/Search topic: AI agents/);
    expect(prompt).toMatch(/Research:5, Government:7/);
    expect(prompt).toMatch(/Executive summary: Agents are hot\./);
    expect(prompt).toMatch(/Build recommendation: Build now\./);
    expect(prompt).toMatch(/6 demand links/);
  });
});

describe('ventureIdeaGenerator.sanitizeIdea', () => {
  it('clamps buildability, validates timing + revenue band, truncates', () => {
    const idea = svc.sanitizeIdea({
      title: 't'.repeat(400),
      buildability_score: 2.5,
      market_timing: 'bogus',
      revenue_potential: 'astronomical',
      suggested_architecture: 'reuse the vector store',
      target_customers: 'gov IT',
    });
    expect(idea.title).toHaveLength(300);
    expect(idea.buildability_score).toBe(1);
    expect(idea.market_timing).toBeNull();
    expect(idea.revenue_potential).toBe('medium'); // invalid → default
    expect(idea.metadata.suggested_architecture).toBe('reuse the vector store');
    expect(idea.metadata.target_customers).toBe('gov IT');
  });

  it('keeps valid enum values', () => {
    const idea = svc.sanitizeIdea({
      title: 'X', market_timing: 'active', revenue_potential: 'very_high', buildability_score: 0.55,
    });
    expect(idea.market_timing).toBe('active');
    expect(idea.revenue_potential).toBe('very_high');
    expect(idea.buildability_score).toBe(0.55);
  });
});

describe('ventureIdeaGenerator.generateVentureIdeas', () => {
  it('parses, sanitizes, caps at 5, and drops nameless ideas', async () => {
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({
        venture_ideas: [
          { title: 'A', revenue_potential: 'high', buildability_score: 0.6 },
          { title: 'B' },
          { description: 'nameless — should be dropped' },
          { title: 'C' }, { title: 'D' }, { title: 'E' }, { title: 'F' }, { title: 'G' },
        ],
      }),
      tokensUsed: 1200,
    });
    const { ideas, tokensUsed } = await svc.generateVentureIdeas(context, synthesis);
    expect(ideas).toHaveLength(5); // capped
    expect(ideas.every((i) => i.title)).toBe(true); // nameless dropped
    expect(ideas[0].revenue_potential).toBe('high');
    expect(tokensUsed).toBe(1200);
  });

  it('returns an empty list for non-JSON output', async () => {
    aiMod.__client.chat.mockResolvedValue({ content: 'sorry', tokensUsed: 5 });
    const { ideas } = await svc.generateVentureIdeas(context, synthesis);
    expect(ideas).toEqual([]);
  });

  it('returns an empty list when venture_ideas is missing', async () => {
    aiMod.__client.chat.mockResolvedValue({ content: JSON.stringify({ other: 1 }), tokensUsed: 5 });
    const { ideas } = await svc.generateVentureIdeas(context, synthesis);
    expect(ideas).toEqual([]);
  });

  it('propagates an AI client failure', async () => {
    aiMod.__client.chat.mockRejectedValue(new Error('429 quota'));
    await expect(svc.generateVentureIdeas(context, synthesis)).rejects.toThrow('429 quota');
  });
});
