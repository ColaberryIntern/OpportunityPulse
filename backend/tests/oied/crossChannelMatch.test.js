// Research Intelligence Phase 2.2 — crossChannelMatch.service tests.
// Pure helpers (extractTerms, scoreCandidate) tested directly; matchOne
// tested with mocked Opportunity model.

jest.mock('../../src/models', () => ({
  Opportunity: { findAll: jest.fn() },
  AnalysisRun: { create: jest.fn(async () => ({ update: jest.fn() })) },
}));

const { Opportunity } = require('../../src/models');
const svc = require('../../src/oied/crossChannelMatch.service');

beforeEach(() => {
  Opportunity.findAll.mockReset();
});

describe('crossChannelMatch.extractTerms', () => {
  it('pulls significant title words, drops stopwords + short words', () => {
    const terms = svc.extractTerms({
      title: 'A Novel Approach to Multi-Agent Memory Systems',
      tags: [],
      sourceData: {},
    });
    // "novel", "approach", "systems" are stopwords; "a", "to" too short.
    expect(terms).toContain('multi-agent');
    expect(terms).toContain('memory');
    expect(terms).not.toContain('novel');
    expect(terms).not.toContain('approach');
    expect(terms).not.toContain('to');
  });

  it('keeps tags and sourceData.domains as whole units', () => {
    const terms = svc.extractTerms({
      title: 'Untitled',
      tags: ['rag', 'retrieval'],
      sourceData: { domains: ['cs.MA'] },
    });
    expect(terms).toContain('rag');
    expect(terms).toContain('retrieval');
    expect(terms).toContain('cs.ma');
  });

  it('drops the over-broad ai/ml/llm stopwords', () => {
    const terms = svc.extractTerms({ title: 'LLM and AI and ML systems', tags: ['llm', 'ai'], sourceData: {} });
    expect(terms).not.toContain('llm');
    expect(terms).not.toContain('ai');
    expect(terms).not.toContain('ml');
  });
});

describe('crossChannelMatch.scoreCandidate', () => {
  it('returns the shared terms found in the candidate text', () => {
    const shared = svc.scoreCandidate(
      ['memory', 'agent', 'retrieval'],
      { title: 'Engineer for AI agent memory systems', description: '', tags: [] },
    );
    expect(shared).toContain('memory');
    expect(shared).toContain('agent');
    expect(shared).not.toContain('retrieval');
  });

  it('searches title + description + tags', () => {
    const shared = svc.scoreCandidate(
      ['darpa', 'autonomous'],
      { title: 'Contract', description: 'A DARPA program', tags: ['autonomous'] },
    );
    expect(shared.sort()).toEqual(['autonomous', 'darpa']);
  });
});

describe('crossChannelMatch.matchOne', () => {
  it('persists top matches with overlap >= MIN_OVERLAP_SCORE, sorted by score', async () => {
    Opportunity.findAll.mockResolvedValue([
      { id: 10, type: 'gov_contract', source: 'sam_gov', title: 'Multi-agent memory contract', description: 'agent memory orchestration', tags: ['memory'], value: 250000 },
      { id: 11, type: 'ai_job', source: 'remote_ok', title: 'Memory engineer', description: 'work on memory', tags: [], value: null },
      { id: 12, type: 'ai_news', source: 'devto', title: 'Totally unrelated cooking blog', description: 'recipes', tags: [], value: null },
    ]);
    const opp = {
      id: 1,
      title: 'Multi-Agent Memory Orchestration',
      tags: ['memory', 'orchestration'],
      sourceData: { domains: ['cs.MA'] },
      aiAnalysis: {},
      update: jest.fn(async () => {}),
    };
    const { matchCount } = await svc.matchOne(opp);
    expect(matchCount).toBeGreaterThanOrEqual(1);
    const persisted = opp.update.mock.calls[0][0].aiAnalysis.cross_channel_matches;
    expect(persisted.matches[0].overlap_score).toBeGreaterThanOrEqual(persisted.matches[persisted.matches.length - 1].overlap_score);
    // The cooking blog (id 12) shares no significant terms → excluded.
    expect(persisted.matches.find((m) => m.opportunity_id === 12)).toBeUndefined();
    // The gov contract (id 10) shares memory + agent/orchestration → included.
    expect(persisted.matches.find((m) => m.opportunity_id === 10)).toBeTruthy();
  });

  it('clears matches + skips the query when the opp has too few significant terms', async () => {
    const opp = { id: 2, title: 'AI', tags: [], sourceData: {}, aiAnalysis: {}, update: jest.fn(async () => {}) };
    const { matchCount } = await svc.matchOne(opp);
    expect(matchCount).toBe(0);
    expect(Opportunity.findAll).not.toHaveBeenCalled();
    expect(opp.update.mock.calls[0][0].aiAnalysis.cross_channel_matches.matches).toEqual([]);
  });
});
