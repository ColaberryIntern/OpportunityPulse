// Pure-function tests for the keyword cloud service.
// DB-bound aggregation is exercised in integration; here we cover the
// helpers + sentiment math + label thresholds.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Opportunity: { findAll: jest.fn() },
  AiTool: { findAll: jest.fn() },
}));

const svc = require('../../src/oied/keywordCloud.service');

describe('keywordCloud.articleSentimentScore', () => {
  it('returns 0 for empty/no-signal text', () => {
    expect(svc.articleSentimentScore('')).toBe(0);
    expect(svc.articleSentimentScore('something happens here today')).toBe(0);
  });
  it('positive signal pulls score up', () => {
    const s = svc.articleSentimentScore('Anthropic launches breakthrough product, raises funding');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });
  it('negative signal pulls score down', () => {
    const s = svc.articleSentimentScore('OpenAI lawsuit threatens shutdown amid layoffs');
    expect(s).toBeLessThan(0);
    expect(s).toBeGreaterThanOrEqual(-1);
  });
  it('clamps to [-1, +1] even with strongly skewed input', () => {
    const s = svc.articleSentimentScore('wins wins wins success success success success success');
    expect(s).toBeLessThanOrEqual(1);
    const n = svc.articleSentimentScore('lawsuit lawsuit lawsuit lawsuit lawsuit failed failed');
    expect(n).toBeGreaterThanOrEqual(-1);
  });
});

describe('keywordCloud.labelForScore (5-band classifier)', () => {
  it('labels at boundaries', () => {
    expect(svc.labelForScore(-0.9)).toBe('very_negative');
    expect(svc.labelForScore(-0.4)).toBe('very_negative');
    expect(svc.labelForScore(-0.39)).toBe('negative');
    expect(svc.labelForScore(-0.1)).toBe('negative');
    expect(svc.labelForScore(-0.09)).toBe('neutral');
    expect(svc.labelForScore(0)).toBe('neutral');
    expect(svc.labelForScore(0.09)).toBe('neutral');
    expect(svc.labelForScore(0.1)).toBe('positive');
    expect(svc.labelForScore(0.39)).toBe('positive');
    expect(svc.labelForScore(0.4)).toBe('very_positive');
    expect(svc.labelForScore(0.9)).toBe('very_positive');
  });
});

describe('keywordCloud.phraseToken (whole-phrase normalizer)', () => {
  it('lowercases + trims', () => {
    expect(svc.phraseToken('  Healthcare AI  ')).toBe('healthcare ai');
  });
  it('rejects too-short and too-long', () => {
    expect(svc.phraseToken('xy')).toBeNull();
    expect(svc.phraseToken('a'.repeat(70))).toBeNull();
  });
  it('rejects pure-number categories (NAICS codes)', () => {
    expect(svc.phraseToken('541715')).toBeNull();
    expect(svc.phraseToken('336412')).toBeNull();
  });
  it('keeps multi-word industry phrases', () => {
    expect(svc.phraseToken('AI/ML Government Contract')).toBe('ai/ml government contract');
    expect(svc.phraseToken('Customer Service Improvement')).toBe('customer service improvement');
  });
  it('rejects null/empty/undefined', () => {
    expect(svc.phraseToken(null)).toBeNull();
    expect(svc.phraseToken('')).toBeNull();
    expect(svc.phraseToken(undefined)).toBeNull();
  });
});

describe('keywordCloud.ALL_SOURCES', () => {
  it('exposes the canonical 5-source list', () => {
    expect(svc.ALL_SOURCES).toEqual([
      'news_titles',
      'news_categories',
      'channel_titles',
      'opp_categories',
      'tool_names',
    ]);
  });
});

describe('keywordCloud.getKeywordCloud — graceful fallback', () => {
  beforeEach(() => {
    require('../../src/models').Opportunity.findAll.mockResolvedValue([]);
    require('../../src/models').AiTool.findAll.mockResolvedValue([]);
  });
  it('returns empty word list when no rows in any source', async () => {
    const out = await svc.getKeywordCloud();
    expect(out.words).toEqual([]);
    expect(out.article_count).toBe(0);
    expect(out.sources).toEqual(svc.ALL_SOURCES);
    expect(out.lookback_days).toBe(14);
  });
  it('honors a sources subset (skip channel_titles)', async () => {
    const out = await svc.getKeywordCloud({ sources: ['news_titles'] });
    expect(out.sources).toEqual(['news_titles']);
  });
});
