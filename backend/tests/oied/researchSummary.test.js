// Research Intelligence Phase 2.1 — researchSummary.service tests.
// Pure helpers tested directly; summarizeOne tested with a mocked AI client.

jest.mock('../../src/models', () => ({
  Opportunity: { findAll: jest.fn() },
  AnalysisRun: { create: jest.fn(async () => ({ update: jest.fn() })) },
}));
jest.mock('../../src/analysis/ai.client', () => {
  const client = { model: 'gpt-4o-mini', chat: jest.fn() };
  return { getAIClient: () => client, __client: client };
});

const aiMod = require('../../src/analysis/ai.client');
const svc = require('../../src/oied/researchSummary.service');

beforeEach(() => {
  aiMod.__client.chat.mockReset();
});

describe('researchSummary.sanitizeSummary', () => {
  it('passes through a well-formed summary', () => {
    const s = svc.sanitizeSummary({
      executive_summary: 'A new memory architecture for agents.',
      build_recommendation: 'Colaberry could wrap this as a service.',
      buildable: true,
      market_timing: 'emerging',
      competitive_insight: 'LangChain is circling this space.',
    }, 'gpt-4o-mini');
    expect(s.buildable).toBe(true);
    expect(s.market_timing).toBe('emerging');
    expect(s.model_used).toBe('gpt-4o-mini');
    expect(s.generated_at).toBeTruthy();
  });

  it('coerces an invalid market_timing to too_early', () => {
    const s = svc.sanitizeSummary({ market_timing: 'mainstream' }, 'gpt-4o-mini');
    expect(s.market_timing).toBe('too_early');
  });

  it('coerces a non-boolean buildable to false', () => {
    const s = svc.sanitizeSummary({ buildable: 'yes' }, 'gpt-4o-mini');
    expect(s.buildable).toBe(false);
  });

  it('caps long fields', () => {
    const s = svc.sanitizeSummary({ executive_summary: 'x'.repeat(2000) }, 'gpt-4o-mini');
    expect(s.executive_summary.length).toBeLessThanOrEqual(600);
  });
});

describe('researchSummary.buildUserPrompt', () => {
  it('includes title, abstract, and sourceData signals', () => {
    const prompt = svc.buildUserPrompt({
      title: 'Memory-Augmented Agents',
      source: 'arxiv',
      description: 'We present a memory layer.',
      sourceData: { venue: 'NeurIPS', citationCount: 12, domains: ['cs.MA'], githubRepo: 'http://x' },
    });
    expect(prompt).toMatch(/Memory-Augmented Agents/);
    expect(prompt).toMatch(/NeurIPS/);
    expect(prompt).toMatch(/Citations: 12/);
    expect(prompt).toMatch(/public GitHub repo: yes/);
    expect(prompt).toMatch(/We present a memory layer/);
  });

  it('omits absent signals without throwing', () => {
    const prompt = svc.buildUserPrompt({ title: 'Bare', description: '' });
    expect(prompt).toMatch(/Title: Bare/);
    expect(prompt).not.toMatch(/Citations:/);
  });
});

describe('researchSummary.summarizeOne', () => {
  it('calls the AI, persists the summary on aiAnalysis.research_summary', async () => {
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({
        executive_summary: 'Solid step for agent memory.',
        build_recommendation: 'Wrap as an API.',
        buildable: true,
        market_timing: 'emerging',
        competitive_insight: 'Few players today.',
      }),
      tokensUsed: 420,
    });
    const opp = {
      id: 1,
      title: 'Memory Agents',
      description: 'abstract',
      aiAnalysis: { classification: { actionType: 'BUILD' } },
      update: jest.fn(async () => {}),
    };
    const { summary, tokensUsed } = await svc.summarizeOne(opp);
    expect(tokensUsed).toBe(420);
    expect(summary.buildable).toBe(true);
    expect(opp.update).toHaveBeenCalledTimes(1);
    const updateArg = opp.update.mock.calls[0][0];
    // Preserves existing aiAnalysis keys, adds research_summary.
    expect(updateArg.aiAnalysis.classification).toBeDefined();
    expect(updateArg.aiAnalysis.research_summary.market_timing).toBe('emerging');
  });

  it('survives a non-JSON AI response (persists a defaulted summary)', async () => {
    aiMod.__client.chat.mockResolvedValue({ content: 'not json at all', tokensUsed: 10 });
    const opp = { id: 2, title: 'T', description: '', aiAnalysis: {}, update: jest.fn(async () => {}) };
    const { summary } = await svc.summarizeOne(opp);
    expect(summary.market_timing).toBe('too_early');
    expect(summary.buildable).toBe(false);
    expect(opp.update).toHaveBeenCalled();
  });
});
