jest.mock('../../src/models', () => ({
  sequelize: {},
  AiTool: { findAll: jest.fn() },
}));

const { getRelatedTools } = require('../../src/oied/relatedTools.service');
const { AiTool } = require('../../src/models');

function row(over = {}) {
  return {
    id: over.id || 1,
    name: over.name || 'Hippocratic AI',
    slug: over.slug || 'hippocratic-ai',
    description: over.description || 'Clinical AI for healthcare workflows.',
    category: over.category || 'Healthcare',
    subcategory: over.subcategory || 'Clinical AI',
    tags: over.tags || ['healthcare', 'clinical', 'ai-agent'],
    trendingScore: over.trendingScore != null ? over.trendingScore : 90,
    mentionCount7d: over.mentionCount7d != null ? over.mentionCount7d : 12,
    sentimentScore: over.sentimentScore != null ? over.sentimentScore : 0.4,
    logoUrl: over.logoUrl || null,
    sourceUrl: over.sourceUrl || null,
    toJSON() { const { toJSON, ...r } = this; return r; },
  };
}

describe('relatedTools.getRelatedTools', () => {
  beforeEach(() => { AiTool.findAll.mockReset(); });

  it('returns empty list for empty q', async () => {
    const out = await getRelatedTools({ q: '' });
    expect(out.tools).toEqual([]);
    expect(out.count).toBe(0);
    expect(AiTool.findAll).not.toHaveBeenCalled();
  });

  it('returns empty list for whitespace q', async () => {
    const out = await getRelatedTools({ q: '   ' });
    expect(out.tools).toEqual([]);
    expect(out.count).toBe(0);
  });

  it('shapes tool rows with summary trimmed to 200 chars', async () => {
    const long = 'A '.repeat(200);
    AiTool.findAll
      .mockResolvedValueOnce([row({ description: long })])  // first pass
      .mockResolvedValueOnce([]);                            // second pass (empty)
    const out = await getRelatedTools({ q: 'healthcare' });
    expect(out.count).toBe(1);
    expect(out.tools[0].name).toBe('Hippocratic AI');
    expect(out.tools[0].summary.length).toBeLessThanOrEqual(200);
    expect(out.tools[0].tags).toContain('healthcare');
    expect(out.tools[0].sentiment_score).toBe(0.4);
  });

  it('falls back to tag-substring search when first pass returns less than max', async () => {
    AiTool.findAll
      .mockResolvedValueOnce([])  // first ILIKE pass returns nothing
      .mockResolvedValueOnce([    // second wide pass returns rows with tag match
        row({ id: 7, name: 'Glass.health', tags: ['healthcare', 'medical'] }),
        row({ id: 8, name: 'NotMatching', tags: ['finance'] }),
      ]);
    const out = await getRelatedTools({ q: 'healthcare' });
    expect(out.count).toBe(1);
    expect(out.tools[0].id).toBe(7);
  });

  it('respects max limit', async () => {
    const tools = Array.from({ length: 20 }, (_, i) => row({ id: i + 1, name: `Tool${i}` }));
    AiTool.findAll
      .mockResolvedValueOnce(tools.slice(0, 3))  // first pass
      .mockResolvedValueOnce(tools.slice(3));    // wide pass — but we already got 3
    const out = await getRelatedTools({ q: 'tool', max: 5 });
    expect(out.tools.length).toBeLessThanOrEqual(5);
  });

  it('returns gracefully on query error', async () => {
    AiTool.findAll.mockRejectedValueOnce(new Error('db fell over'));
    const out = await getRelatedTools({ q: 'healthcare' });
    expect(out.tools).toEqual([]);
    expect(out.error).toBe('db fell over');
  });
});
