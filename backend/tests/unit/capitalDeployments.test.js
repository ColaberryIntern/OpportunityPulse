// Contract tests for the Capital Deployments repair (v9.11).
//
// Covers the two code-level fixes that unblocked the channel:
//   1. investmentScore — fresh real rows must get a non-null, ranked score so
//      they can beat seeded demo rows under `aiScore DESC NULLS LAST`.
//   2. fundingNews adapter — the dead /fundraise/ feed must be pruned even when
//      a stale DB config still references it, and transformed rows must carry a
//      numeric aiScore + parsed publishedAt.
//
// Test types per the Test Strategy Framework: happy path, failure path,
// boundary cases, and idempotency.

jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

// rss-parser is only exercised in fetch(); constructor + transform don't need
// the network. Mock it so requiring the adapter never opens a real connection.
jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({
  parseURL: jest.fn().mockResolvedValue({ items: [] }),
})));

const {
  scoreInvestment, amountScore, recencyScore, relevanceScore,
} = require('../../src/utils/investmentScore');
const FundingNewsAdapter = require('../../src/ingestion/adapters/fundingNews.adapter');

const NOW = new Date('2026-06-10T00:00:00Z');

describe('investmentScore', () => {
  describe('amountScore', () => {
    it('is monotonic in funding size (bigger raise scores higher)', () => {
      expect(amountScore(500_000_000)).toBeGreaterThan(amountScore(50_000_000));
      expect(amountScore(50_000_000)).toBeGreaterThan(amountScore(5_000_000));
    });

    it('uses a neutral baseline for null/unknown/sub-$1M amounts (boundary)', () => {
      expect(amountScore(null)).toBe(40);
      expect(amountScore(0)).toBe(40);
      expect(amountScore(500_000)).toBe(40);
    });

    it('clamps to 0–100', () => {
      expect(amountScore(1e15)).toBeLessThanOrEqual(100);
      expect(amountScore(1_000_000)).toBeGreaterThanOrEqual(40);
    });
  });

  describe('recencyScore', () => {
    it('decays with age (fresh outranks stale)', () => {
      const fresh = recencyScore(new Date('2026-06-09'), NOW);
      const old = recencyScore(new Date('2026-02-15'), NOW);
      expect(fresh).toBeGreaterThan(old);
      expect(fresh).toBeGreaterThan(90);
    });

    it('floors stale rows at 10 and handles null (boundary)', () => {
      expect(recencyScore(new Date('2024-01-01'), NOW)).toBe(10);
      expect(recencyScore(null, NOW)).toBe(30);
    });
  });

  describe('relevanceScore', () => {
    it('rewards AI/tech keywords and avoids false matches like "html"', () => {
      expect(relevanceScore('AI infrastructure for autonomous agents'))
        .toBeGreaterThan(relevanceScore('a bakery raises money'));
      // "ml" must not match inside "html"
      expect(relevanceScore('html templating startup')).toBe(relevanceScore('a plain startup'));
    });
  });

  describe('scoreInvestment', () => {
    it('produces a non-null number in 0–100 (the core contract)', () => {
      const s = scoreInvestment(
        { value: 500_000_000, publishedAt: new Date('2026-06-08'), title: 'AI co raises', tags: ['ai'] },
        NOW,
      );
      expect(typeof s).toBe('number');
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(100);
    });

    it('ranks a fresh large AI raise above a stale unknown one', () => {
      const freshBig = scoreInvestment(
        { value: 500_000_000, publishedAt: new Date('2026-06-08'), title: 'AI raise', tags: ['ai'] }, NOW,
      );
      const staleSmall = scoreInvestment(
        { value: null, publishedAt: new Date('2026-02-15'), title: 'bakery raise', tags: [] }, NOW,
      );
      expect(freshBig).toBeGreaterThan(staleSmall);
    });

    it('is deterministic / idempotent (same input → same score)', () => {
      const input = { value: 12_000_000, publishedAt: new Date('2026-06-01'), title: 'ML startup', tags: ['ml'] };
      expect(scoreInvestment(input, NOW)).toBe(scoreInvestment(input, NOW));
    });

    it('handles a fully-empty row without throwing (boundary)', () => {
      const s = scoreInvestment({ value: null, publishedAt: null }, NOW);
      expect(typeof s).toBe('number');
      expect(s).toBeGreaterThan(0);
    });
  });
});

describe('FundingNewsAdapter feed resolution', () => {
  it('prunes the dead /fundraise/ feed even when a stale DB config pins it', () => {
    const adapter = new FundingNewsAdapter({
      name: 'funding_news',
      config: { feeds: ['https://techcrunch.com/category/fundraise/feed/'] },
    });
    expect(adapter.feeds).not.toContain('https://techcrunch.com/category/fundraise/feed/');
  });

  it('always includes the known-good defaults (stale DB cannot remove them)', () => {
    const adapter = new FundingNewsAdapter({
      name: 'funding_news',
      config: { feeds: ['https://techcrunch.com/category/fundraise/feed/'] },
    });
    expect(adapter.feeds).toContain('https://news.crunchbase.com/feed/');
    expect(adapter.feeds.length).toBeGreaterThan(0);
  });

  it('merges and de-duplicates a still-valid DB feed with defaults', () => {
    const adapter = new FundingNewsAdapter({
      name: 'funding_news',
      config: { feeds: ['https://news.crunchbase.com/feed/', 'https://example.com/extra/feed/'] },
    });
    const crunchbaseCount = adapter.feeds.filter((f) => f === 'https://news.crunchbase.com/feed/').length;
    expect(crunchbaseCount).toBe(1);
    expect(adapter.feeds).toContain('https://example.com/extra/feed/');
  });
});

describe('FundingNewsAdapter transform contract', () => {
  const adapter = new FundingNewsAdapter({ name: 'funding_news', config: {} });

  it('emits a numeric aiScore and parsed publishedAt (the ranking contract)', () => {
    const [row] = adapter.transform([{
      title: 'Acme AI raises $200M Series B',
      contentSnippet: 'Acme AI, a machine learning startup, raised $200 million.',
      link: 'https://techcrunch.com/2026/06/09/acme-ai/',
      guid: 'https://techcrunch.com/2026/06/09/acme-ai/',
      isoDate: '2026-06-09T12:00:00Z',
      _matchedKeywords: ['AI', 'funding', 'series'],
    }]);

    expect(row.type).toBe('investment');
    expect(row.source).toBe('funding_news');
    expect(typeof row.aiScore).toBe('number');
    expect(row.aiScore).toBeGreaterThan(0);
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect(row.value).toBe(200_000_000);
  });

  it('still scores a row with no funding amount / no date (failure/boundary path)', () => {
    const [row] = adapter.transform([{
      title: 'Some AI company news',
      contentSnippet: 'No dollar figure here.',
      link: 'https://example.com/x',
      _matchedKeywords: ['AI'],
    }]);
    expect(row.value).toBeNull();
    expect(typeof row.aiScore).toBe('number');
    expect(row.aiScore).toBeGreaterThan(0);
  });
});
