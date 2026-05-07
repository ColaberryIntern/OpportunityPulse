// v9.8 drill-down sub-cloud tests. Mocks Opportunity.findAll so we can
// assert the AND-needle filter, parent-keyword exclusion, and
// sentiment-known plumbing without touching the DB.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Opportunity: { findAll: jest.fn() },
  AiTool: { findAll: jest.fn() },
}));
jest.mock('../../src/oied/channels.service', () => ({
  getChannelKey: () => 'private-sector',
  listChannels: () => [],
}));

const { Opportunity } = require('../../src/models');
const svc = require('../../src/oied/keywordCloud.service');

beforeEach(() => Opportunity.findAll.mockReset());

describe('keywordCloud.getDrillDownCloud', () => {
  it('returns empty for empty / no-token q', async () => {
    const out1 = await svc.getDrillDownCloud({ q: [] });
    expect(out1.words).toEqual([]);
    const out2 = await svc.getDrillDownCloud({ q: ['', '  '] });
    expect(out2.words).toEqual([]);
    expect(Opportunity.findAll).not.toHaveBeenCalled();
  });

  it('runs an AND-needle ILIKE for multiple parent keywords', async () => {
    Opportunity.findAll.mockResolvedValueOnce([]);
    await svc.getDrillDownCloud({ q: ['healthcare', 'compliance'] });
    const args = Opportunity.findAll.mock.calls[0][0];
    const andClauses = args.where[Object.getOwnPropertySymbols(args.where).find((s) => s.toString().includes('and'))];
    // Two AND clauses, one per parent token.
    expect(Array.isArray(andClauses)).toBe(true);
    expect(andClauses).toHaveLength(2);
  });

  it('excludes parent keywords from the sub-cloud output', async () => {
    Opportunity.findAll.mockResolvedValueOnce([
      { toJSON: () => ({
        id: 1, type: 'ai_news', source: 'rss', title: 'Healthcare claims processing wins',
        description: 'healthcare claims compliance',
        category: null, createdAt: new Date(),
      }) },
      { toJSON: () => ({
        id: 2, type: 'ai_news', source: 'rss', title: 'Healthcare claims update',
        description: 'medical compliance and claims', category: null, createdAt: new Date(),
      }) },
    ]);
    const out = await svc.getDrillDownCloud({ q: ['healthcare'] });
    const words = out.words.map((w) => w.word);
    expect(words).not.toContain('healthcare');
    // 'claims' co-occurs in both rows (count >= 2 threshold) — should appear.
    expect(words).toContain('claims');
  });

  it('flags sentiment_known true when parent matches news rows with sentiment', async () => {
    Opportunity.findAll.mockResolvedValueOnce([
      { toJSON: () => ({
        id: 1, type: 'ai_news', source: 'rss', title: 'Healthcare wins breakthrough launch',
        description: '', category: null, createdAt: new Date(),
      }) },
      { toJSON: () => ({
        id: 2, type: 'ai_news', source: 'rss', title: 'Healthcare wins success milestone',
        description: '', category: null, createdAt: new Date(),
      }) },
    ]);
    const out = await svc.getDrillDownCloud({ q: ['healthcare'] });
    const wins = out.words.find((w) => w.word === 'wins');
    expect(wins).toBeDefined();
    expect(wins.sentiment_known).toBe(true);
  });

  it('marks sentiment_known false for non-news rows (no sentiment-bearing source)', async () => {
    Opportunity.findAll.mockResolvedValueOnce([
      { toJSON: () => ({
        id: 1, type: 'gov_contract', source: 'sam', title: 'Healthcare claims processing',
        description: 'claims claims claims', category: null, createdAt: new Date(),
      }) },
      { toJSON: () => ({
        id: 2, type: 'gov_contract', source: 'sam', title: 'Healthcare claims',
        description: 'claims', category: null, createdAt: new Date(),
      }) },
    ]);
    const out = await svc.getDrillDownCloud({ q: ['healthcare'] });
    const claims = out.words.find((w) => w.word === 'claims');
    expect(claims).toBeDefined();
    expect(claims.sentiment_known).toBe(false);
    expect(claims.sentiment_label).toBe('unknown');
  });
});
