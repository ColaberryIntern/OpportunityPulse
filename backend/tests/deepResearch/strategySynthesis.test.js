// Deep Research Intelligence Engine — strategySynthesis.service tests.

jest.mock('../../src/analysis/ai.client', () => {
  const client = { model: 'gpt-4o-mini', chat: jest.fn() };
  return { getAIClient: () => client, __client: client };
});

const aiMod = require('../../src/analysis/ai.client');
const svc = require('../../src/deepResearch/strategySynthesis.service');

beforeEach(() => { aiMod.__client.chat.mockReset(); });

const sampleContext = {
  searchTerm: 'AI agents',
  totals: {
    sourceCount: 12, channelCount: 3, totalValue: 450000,
    buildableResearchCount: 4, withDemandSignalCount: 6,
  },
  channels: [
    {
      key: 'research', label: 'Research', count: 5, totalValue: 0,
      items: [{ title: 'Memory agents paper', buildable: true, marketTiming: 'emerging', githubRepo: 'http://gh', crossChannelLinks: 2, excerpt: 'A memory layer.' }],
    },
    {
      key: 'government', label: 'Government', count: 7, totalValue: 450000,
      items: [{ title: 'State IT contract', value: 250000, actionType: 'BID', crossChannelLinks: 0 }],
    },
  ],
};

describe('strategySynthesis.buildUserPrompt', () => {
  it('includes the topic, totals, and channel evidence', () => {
    const prompt = svc.buildUserPrompt(sampleContext);
    expect(prompt).toMatch(/Search topic: AI agents/);
    expect(prompt).toMatch(/12 opportunities across 3 channels/);
    expect(prompt).toMatch(/## Research \(5 opportunities/);
    expect(prompt).toMatch(/Memory agents paper/);
    expect(prompt).toMatch(/BUILDABLE/);
    expect(prompt).toMatch(/State IT contract/);
  });
});

describe('strategySynthesis.sanitizeSynthesis', () => {
  it('clamps confidence, validates market_stage, truncates, and bounds arrays', () => {
    const out = svc.sanitizeSynthesis({
      executive_summary: 'x'.repeat(2000),
      market_stage: 'not_a_stage',
      confidence_score: 5,
      opportunity_signals: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 123, null],
      research_highlights: 'not an array',
    });
    expect(out.executive_summary).toHaveLength(1500);
    expect(out.market_stage).toBe('unknown');
    expect(out.confidence_score).toBe(1);
    expect(out.opportunity_signals).toHaveLength(6); // capped, non-strings dropped
    expect(out.research_highlights).toEqual([]);
  });

  it('keeps a valid market_stage and a negative confidence floors to 0', () => {
    const out = svc.sanitizeSynthesis({ market_stage: 'active', confidence_score: -2 });
    expect(out.market_stage).toBe('active');
    expect(out.confidence_score).toBe(0);
  });

  it('handles a completely empty / non-object input', () => {
    const out = svc.sanitizeSynthesis(null);
    expect(out.market_stage).toBe('unknown');
    expect(out.executive_summary).toBe('');
    expect(out.opportunity_signals).toEqual([]);
  });
});

describe('strategySynthesis.synthesize', () => {
  it('calls the AI and returns the sanitized synthesis + tokens', async () => {
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({
        executive_summary: 'Agents are hot.',
        market_stage: 'emerging',
        confidence_score: 0.7,
        opportunity_signals: ['6 cross-channel demand links'],
      }),
      tokensUsed: 800,
    });
    const { synthesis, tokensUsed } = await svc.synthesize(sampleContext);
    expect(synthesis.executive_summary).toBe('Agents are hot.');
    expect(synthesis.market_stage).toBe('emerging');
    expect(tokensUsed).toBe(800);
  });

  it('tolerates non-JSON AI output by returning an empty-ish synthesis', async () => {
    aiMod.__client.chat.mockResolvedValue({ content: 'no json here', tokensUsed: 10 });
    const { synthesis } = await svc.synthesize(sampleContext);
    expect(synthesis.market_stage).toBe('unknown');
    expect(synthesis.executive_summary).toBe('');
  });

  it('propagates an AI client failure (the hard gate)', async () => {
    aiMod.__client.chat.mockRejectedValue(new Error('429 quota'));
    await expect(svc.synthesize(sampleContext)).rejects.toThrow('429 quota');
  });
});
