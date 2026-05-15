// Deep Research Phase 7.6 — competingTools.service pure-logic tests.

const svc = require('../../src/deepResearch/competingTools.service');

describe('competingTools.tokenizeTerm', () => {
  it('drops stopwords and short tokens', () => {
    expect(svc.tokenizeTerm('AI consulting services for the government'))
      .toEqual(['government']);
  });
  it('returns empty for empty / null input', () => {
    expect(svc.tokenizeTerm('')).toEqual([]);
    expect(svc.tokenizeTerm(null)).toEqual([]);
  });
  it('handles comma + slash separators', () => {
    expect(svc.tokenizeTerm('rag, healthcare/defense'))
      .toEqual(expect.arrayContaining(['rag', 'healthcare', 'defense']));
  });
});

describe('competingTools.tokensFromContext', () => {
  it('returns empty when context has no channels', () => {
    expect(svc.tokensFromContext({})).toEqual([]);
  });
  it('extracts top-frequency 3+ char tokens from item titles', () => {
    const context = {
      channels: [{
        items: [
          { title: 'RAG retrieval government summarization' },
          { title: 'RAG retrieval defense pipeline' },
          { title: 'RAG defense automation' },
        ],
      }],
    };
    const out = svc.tokensFromContext(context, { max: 4 });
    expect(out).toContain('rag');
    expect(out).toContain('defense');
    expect(out).not.toContain('the');
  });
});

describe('competingTools.buildSearchTokens', () => {
  it('combines term tokens + context tokens uniquely', () => {
    const context = { channels: [{ items: [{ title: 'rag defense automation' }] }] };
    const tokens = svc.buildSearchTokens('rag healthcare', context);
    expect(tokens).toContain('rag');
    expect(tokens).toContain('healthcare');
    expect(tokens).toContain('defense');
    // Dedup: 'rag' appears only once.
    expect(tokens.filter((t) => t === 'rag')).toHaveLength(1);
  });
});

describe('competingTools.scoreTool', () => {
  it('returns null when no tokens match', () => {
    const tool = { name: 'Cursor', description: 'AI code editor', tags: ['code'], industries: [], category: 'Code Assistant' };
    expect(svc.scoreTool(tool, ['healthcare', 'compliance'])).toBeNull();
  });
  it('weights name matches > description matches', () => {
    const nameMatch = { name: 'RAG Builder', description: 'enterprise platform', tags: [], industries: [], category: 'Search' };
    const descMatch = { name: 'Acme', description: 'rag-based search engine', tags: [], industries: [], category: 'Search' };
    const ns = svc.scoreTool(nameMatch, ['rag']);
    const ds = svc.scoreTool(descMatch, ['rag']);
    expect(ns.score).toBeGreaterThan(ds.score);
  });
  it('adds momentum + trending + mention bonuses', () => {
    const cold = { name: 'RAG Builder', description: '', tags: [], industries: [], category: '', compositeMomentumScore: 0, trendingScore: 0, mentionCount7d: 0 };
    const hot = { name: 'RAG Builder', description: '', tags: [], industries: [], category: '', compositeMomentumScore: 90, trendingScore: 95, mentionCount7d: 25 };
    expect(svc.scoreTool(hot, ['rag']).score).toBeGreaterThan(svc.scoreTool(cold, ['rag']).score);
  });
});

describe('competingTools.classifySaturation', () => {
  it('empty when no tools', () => {
    expect(svc.classifySaturation([])).toBe('empty');
  });
  it('emerging for 1-3 tools', () => {
    expect(svc.classifySaturation([{ momentum_stage: 'emerging' }])).toBe('emerging');
    expect(svc.classifySaturation([
      { momentum_stage: 'emerging' }, { momentum_stage: 'emerging' }, { momentum_stage: 'emerging' },
    ])).toBe('emerging');
  });
  it('active for 4-5 tools', () => {
    const tools = Array.from({ length: 4 }, () => ({ momentum_stage: 'accelerating' }));
    expect(svc.classifySaturation(tools)).toBe('active');
  });
  it('crowded when 6+ tools AND >= 2 dominant/explosive', () => {
    const tools = [
      { momentum_stage: 'dominant' }, { momentum_stage: 'explosive' },
      { momentum_stage: 'accelerating' }, { momentum_stage: 'emerging' },
      { momentum_stage: 'emerging' }, { momentum_stage: 'emerging' },
    ];
    expect(svc.classifySaturation(tools)).toBe('crowded');
  });
  it('falls back to active for 6+ tools without 2 dominant', () => {
    const tools = Array.from({ length: 6 }, () => ({ momentum_stage: 'emerging' }));
    expect(svc.classifySaturation(tools)).toBe('active');
  });
});

describe('competingTools.summarizeTool', () => {
  it('strips internal fields + casts numbers', () => {
    const tool = {
      id: 1, slug: 'cursor', name: 'Cursor', vendor: 'Anysphere',
      category: 'Code Assistant', description: 'AI code editor',
      pricingTier: 'paid', trendingScore: '88.5', compositeMomentumScore: '95',
      momentumStage: 'explosive', trendDirection: 'rising', mentionCount7d: 30,
      sentimentScore: '0.92', openSource: false, website: 'https://cursor.com',
    };
    const out = svc.summarizeTool(tool);
    expect(out.trending_score).toBe(88.5);
    expect(out.composite_momentum_score).toBe(95);
    expect(out.sentiment_score).toBe(0.92);
    expect(out).not.toHaveProperty('updatedAt');
  });
});
