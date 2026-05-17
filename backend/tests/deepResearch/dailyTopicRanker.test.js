// Daily auto-topic ranker — pure-logic unit tests.

const ranker = require('../../src/deepResearch/dailyTopicRanker.service');

describe('dailyTopicRanker', () => {
  test('WEIGHTS sum to 1.0', () => {
    const sum = Object.values(ranker.WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.01);
  });

  test('RECENT_DAYS + COVERAGE_WINDOW_DAYS are positive integers', () => {
    expect(Number.isInteger(ranker.RECENT_DAYS)).toBe(true);
    expect(ranker.RECENT_DAYS).toBeGreaterThan(0);
    expect(Number.isInteger(ranker.COVERAGE_WINDOW_DAYS)).toBe(true);
    expect(ranker.COVERAGE_WINDOW_DAYS).toBeGreaterThan(0);
  });

  test('isUsefulCandidate filters short, long, empty, and stopword inputs', () => {
    expect(ranker.isUsefulCandidate('')).toBe(false);
    expect(ranker.isUsefulCandidate(null)).toBe(false);
    expect(ranker.isUsefulCandidate(undefined)).toBe(false);
    expect(ranker.isUsefulCandidate('ai')).toBe(false);  // too short
    expect(ranker.isUsefulCandidate('the')).toBe(false); // stopword
    expect(ranker.isUsefulCandidate('data')).toBe(false); // stopword
    expect(ranker.isUsefulCandidate('X'.repeat(120))).toBe(false); // too long
    expect(ranker.isUsefulCandidate('healthcare AI')).toBe(true);
    expect(ranker.isUsefulCandidate('workflow automation')).toBe(true);
  });

  test('normalize lowercases + collapses whitespace', () => {
    expect(ranker.normalize('  Federal   Compliance  ')).toBe('federal compliance');
    expect(ranker.normalize(null)).toBe('');
  });

  test('STOPWORDS includes generic noise words', () => {
    for (const w of ['the', 'and', 'inc', 'llc', 'data', 'system']) {
      expect(ranker.STOPWORDS.has(w)).toBe(true);
    }
  });

  test('scoreCandidate produces deterministic composite from sub-scores', () => {
    const ctx = {
      maxOccurrence: 10, maxValue: 1_000_000,
      researchTopics: [{ topicName: 'healthcare ai', momentumScore: 80 }],
      recentOpportunities: [
        { title: 'Healthcare AI platform', value: 500_000 },
        { title: 'Other thing', value: 100_000 },
      ],
      recentReports: [],
    };
    const out = ranker.scoreCandidate(
      { value: 'healthcare ai', occurrenceCount: 8, relationshipType: 'technology' },
      ctx,
    );
    expect(out.candidate).toBe('healthcare ai');
    expect(out.composite).toBeGreaterThan(0);
    expect(out.composite).toBeLessThanOrEqual(100);
    expect(typeof out.sub_scores.recurring_frequency).toBe('number');
    expect(typeof out.sub_scores.research_momentum).toBe('number');
    expect(typeof out.sub_scores.opportunity_value).toBe('number');
    expect(typeof out.sub_scores.coverage_freshness).toBe('number');
    // Each sub-score is in [0, 100]
    for (const v of Object.values(out.sub_scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test('scoreCandidate penalizes coverage_freshness when topic was recently covered', () => {
    const baseCtx = {
      maxOccurrence: 10, maxValue: 1_000_000,
      researchTopics: [], recentOpportunities: [], recentReports: [],
    };
    const candidate = { value: 'workflow automation', occurrenceCount: 5 };
    const freshOut = ranker.scoreCandidate(candidate, baseCtx);
    const coveredCtx = {
      ...baseCtx,
      recentReports: [{
        searchTerm: 'workflow automation',
        createdAt: new Date(),  // covered today
      }],
    };
    const coveredOut = ranker.scoreCandidate(candidate, coveredCtx);
    expect(coveredOut.sub_scores.coverage_freshness)
      .toBeLessThan(freshOut.sub_scores.coverage_freshness);
  });

  test('scoreCandidate rewards research_momentum on lexical overlap', () => {
    const ctx = {
      maxOccurrence: 10, maxValue: 1_000_000,
      researchTopics: [{ topicName: 'healthcare ai diagnostics', momentumScore: 90 }],
      recentOpportunities: [], recentReports: [],
    };
    const out = ranker.scoreCandidate(
      { value: 'healthcare ai', occurrenceCount: 1 },
      ctx,
    );
    expect(out.sub_scores.research_momentum).toBeGreaterThanOrEqual(80);
  });

  test('scoreCandidate gives recurring_frequency 0 when occurrenceCount is 0', () => {
    const ctx = {
      maxOccurrence: 10, maxValue: 1_000_000,
      researchTopics: [], recentOpportunities: [], recentReports: [],
    };
    const out = ranker.scoreCandidate(
      { value: 'research topic seed', occurrenceCount: 0 },
      ctx,
    );
    expect(out.sub_scores.recurring_frequency).toBe(0);
  });

  test('buildCandidates dedupes + filters stopwords + caps length', () => {
    const ctx = {
      relationships: [
        { value: 'healthcare ai', relationshipType: 'technology', occurrenceCount: 10 },
        { value: 'Healthcare AI', relationshipType: 'keyword', occurrenceCount: 8 }, // dup
        { value: 'data', relationshipType: 'keyword', occurrenceCount: 5 }, // stopword
        { value: 'ai', relationshipType: 'keyword', occurrenceCount: 3 },   // too short
        { value: 'workflow automation', relationshipType: 'technology', occurrenceCount: 4 },
      ],
      researchTopics: [
        { topicName: 'healthcare ai diagnostics', momentumScore: 90 },     // novel
        { topicName: 'Healthcare AI', momentumScore: 80 },                  // dup of #1
      ],
    };
    const out = ranker.buildCandidates(ctx);
    const values = out.map((c) => ranker.normalize(c.value));
    expect(values).toContain('healthcare ai');
    expect(values).toContain('workflow automation');
    expect(values).toContain('healthcare ai diagnostics');
    expect(values).not.toContain('data');
    expect(values).not.toContain('ai');
    // No duplicate of healthcare ai
    expect(values.filter((v) => v === 'healthcare ai').length).toBe(1);
  });
});
