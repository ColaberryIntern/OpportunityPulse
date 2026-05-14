// Research Intelligence Phase 2.3 — researchAggregation.service tests.
// Pure aggregation functions tested directly (no DB).

jest.mock('../../src/models', () => ({
  Opportunity: { findAll: jest.fn() },
  ResearchAuthor: { findOrCreate: jest.fn(), findAll: jest.fn() },
  ResearchTopic: { findOrCreate: jest.fn(), findAll: jest.fn() },
  AnalysisRun: { create: jest.fn(async () => ({ update: jest.fn() })) },
}));

const svc = require('../../src/oied/researchAggregation.service');

const DAY = 86_400_000;

describe('researchAggregation.aggregateAuthors', () => {
  it('counts papers + sums citations per distinct author name', () => {
    const opps = [
      { source: 'arxiv', publishedAt: new Date(), tags: [],
        sourceData: { authors: ['A. Smith', 'B. Jones'], citationCount: 10, domains: ['cs.MA'] } },
      { source: 'semantic_scholar', publishedAt: new Date(), tags: [],
        sourceData: { authors: ['A. Smith'], citationCount: 40, domains: ['cs.AI'] } },
    ];
    const map = svc.aggregateAuthors(opps);
    expect(map.get('A. Smith').paperCount).toBe(2);
    expect(map.get('A. Smith').citationCount).toBe(50);
    expect(map.get('A. Smith').topics.has('cs.ma')).toBe(true);
    expect(map.get('A. Smith').topics.has('cs.ai')).toBe(true);
    expect(map.get('B. Jones').paperCount).toBe(1);
  });

  it('skips empty / whitespace author names', () => {
    const map = svc.aggregateAuthors([
      { source: 'arxiv', publishedAt: new Date(), tags: [], sourceData: { authors: ['', '  ', 'Real Name'] } },
    ]);
    expect(map.size).toBe(1);
    expect(map.has('Real Name')).toBe(true);
  });
});

describe('researchAggregation.aggregateTopics', () => {
  it('buckets papers into recent vs prior windows for momentum', () => {
    const now = Date.now();
    const opps = [
      { tags: ['agents'], publishedAt: new Date(now - 5 * DAY), sourceData: { domains: [] } },       // recent
      { tags: ['agents'], publishedAt: new Date(now - 10 * DAY), sourceData: { domains: [] } },      // recent
      { tags: ['agents'], publishedAt: new Date(now - 45 * DAY), sourceData: { domains: [] } },      // prior
    ];
    const map = svc.aggregateTopics(opps);
    expect(map.get('agents').paperCount).toBe(3);
    expect(map.get('agents').recentCount).toBe(2);
    expect(map.get('agents').priorCount).toBe(1);
  });

  it('dedupes a topic within a single paper (domain + tag same name)', () => {
    const map = svc.aggregateTopics([
      { tags: ['memory'], publishedAt: new Date(), sourceData: { domains: ['memory'] } },
    ]);
    expect(map.get('memory').paperCount).toBe(1);
  });
});

describe('researchAggregation.topicCommercialScore', () => {
  it('scores exact high-priority keywords at 100', () => {
    expect(svc.topicCommercialScore('reasoning')).toBe(100);
    expect(svc.topicCommercialScore('multi-agent')).toBe(100);
  });
  it('scores keyword-containing topics at 60', () => {
    expect(svc.topicCommercialScore('agentic workflows')).toBe(60);
  });
  it('scores unrelated topics at 20', () => {
    expect(svc.topicCommercialScore('quantum chromodynamics')).toBe(20);
  });
});
