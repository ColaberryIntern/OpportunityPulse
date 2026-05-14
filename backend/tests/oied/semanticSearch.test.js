// Research Intelligence Phase 3b — semanticSearch.service tests.
// Pure helpers tested directly; embed/search tested with mocked AI + model.

jest.mock('../../src/models', () => ({
  Opportunity: { findAll: jest.fn(), findByPk: jest.fn() },
  AnalysisRun: { create: jest.fn(async () => ({ update: jest.fn() })) },
}));
jest.mock('../../src/analysis/ai.client', () => {
  const client = { model: 'gpt-4o-mini', embed: jest.fn() };
  return { getAIClient: () => client, __client: client };
});

const { Opportunity } = require('../../src/models');
const aiMod = require('../../src/analysis/ai.client');
const svc = require('../../src/oied/semanticSearch.service');

beforeEach(() => {
  Opportunity.findAll.mockReset();
  Opportunity.findByPk.mockReset();
  aiMod.__client.embed.mockReset();
});

describe('semanticSearch.cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(svc.cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it('returns 0 for orthogonal vectors', () => {
    expect(svc.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it('returns 0 for mismatched lengths or empties', () => {
    expect(svc.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(svc.cosineSimilarity([], [])).toBe(0);
    expect(svc.cosineSimilarity(null, [1])).toBe(0);
  });
  it('ranks a closer vector higher than a farther one', () => {
    const q = [1, 1, 0];
    const close = svc.cosineSimilarity(q, [1, 0.9, 0.1]);
    const far = svc.cosineSimilarity(q, [-1, -1, 0]);
    expect(close).toBeGreaterThan(far);
  });
});

describe('semanticSearch.embeddingText', () => {
  it('combines title + description + tags + domains', () => {
    const text = svc.embeddingText({
      title: 'Memory Agents',
      description: 'A memory layer for agents.',
      tags: ['agents', 'memory'],
      sourceData: { domains: ['cs.MA'] },
    });
    expect(text).toMatch(/Memory Agents/);
    expect(text).toMatch(/memory layer/);
    expect(text).toMatch(/cs.MA/);
  });
});

describe('semanticSearch.semanticSearch', () => {
  it('embeds the query, cosine-ranks embedded opps, rolls up by channel', async () => {
    aiMod.__client.embed.mockResolvedValue({ vectors: [[1, 0, 0]], model: 'text-embedding-3-small' });
    Opportunity.findAll.mockResolvedValue([
      { id: 1, type: 'research', source: 'arxiv', title: 'Close paper', description: '', tags: [], value: null, sourceUrl: null, embedding: [0.95, 0.05, 0], aiAnalysis: {} },
      { id: 2, type: 'gov_contract', source: 'sam_gov', title: 'Somewhat related', description: '', tags: [], value: 1000, sourceUrl: null, embedding: [0.6, 0.4, 0], aiAnalysis: {} },
      { id: 3, type: 'ai_news', source: 'devto', title: 'Unrelated', description: '', tags: [], value: null, sourceUrl: null, embedding: [-1, 0, 0], aiAnalysis: {} },
    ]);
    const out = await svc.semanticSearch('memory agents', { limit: 10, minScore: 0.25 });
    expect(out.results[0].opportunity_id).toBe(1); // closest first
    expect(out.results.find((r) => r.opportunity_id === 3)).toBeUndefined(); // below minScore
    expect(out.by_channel.research).toBe(1);
    expect(out.by_channel.government).toBe(1);
  });

  it('respects the channels filter', async () => {
    aiMod.__client.embed.mockResolvedValue({ vectors: [[1, 0, 0]] });
    Opportunity.findAll.mockResolvedValue([
      { id: 1, type: 'research', source: 'arxiv', title: 'P', description: '', tags: [], embedding: [1, 0, 0], aiAnalysis: {} },
      { id: 2, type: 'gov_contract', source: 'sam_gov', title: 'C', description: '', tags: [], embedding: [1, 0, 0], aiAnalysis: {} },
    ]);
    const out = await svc.semanticSearch('x', { channels: ['research'] });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].channel).toBe('research');
  });

  it('returns empty for a blank query without calling the AI', async () => {
    const out = await svc.semanticSearch('   ');
    expect(out.results).toEqual([]);
    expect(aiMod.__client.embed).not.toHaveBeenCalled();
  });
});

describe('semanticSearch.findSimilar', () => {
  it('ranks other opps by cosine to the seed opp embedding', async () => {
    Opportunity.findByPk.mockResolvedValue({ id: 1, embedding: [1, 0, 0] });
    Opportunity.findAll.mockResolvedValue([
      { id: 2, type: 'research', source: 'arxiv', title: 'Close', value: null, sourceUrl: null, embedding: [0.9, 0.1, 0] },
      { id: 3, type: 'research', source: 'arxiv', title: 'Far', value: null, sourceUrl: null, embedding: [0, 0, 1] },
    ]);
    const out = await svc.findSimilar(1, { minScore: 0.2 });
    expect(out.results[0].opportunity_id).toBe(2);
    expect(out.results.find((r) => r.opportunity_id === 3)).toBeUndefined();
  });

  it('returns NOT_FOUND for a missing opp', async () => {
    Opportunity.findByPk.mockResolvedValue(null);
    await expect(svc.findSimilar(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns empty when the seed opp has no embedding', async () => {
    Opportunity.findByPk.mockResolvedValue({ id: 1, embedding: null });
    const out = await svc.findSimilar(1);
    expect(out.results).toEqual([]);
  });
});
