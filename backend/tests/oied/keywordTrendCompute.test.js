// Pure-function tests for keyword trend compute helpers.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Opportunity: { count: jest.fn() },
  AiTool: { count: jest.fn() },
  KeywordTrend: {
    bulkCreate: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../../src/oied/keywordCloud.service', () => ({
  ALL_SOURCES: ['news_titles', 'news_categories', 'channel_titles', 'opp_categories', 'tool_names'],
  getKeywordCloud: jest.fn(),
}));

const svc = require('../../src/oied/keywordTrendCompute.service');
const { Opportunity, AiTool, KeywordTrend } = require('../../src/models');
const cloud = require('../../src/oied/keywordCloud.service');

describe('keywordTrendCompute.isIndustryPhrase', () => {
  it('matches curated verticals', () => {
    expect(svc.isIndustryPhrase('healthcare')).toBe(true);
    expect(svc.isIndustryPhrase('Retail')).toBe(true);
    expect(svc.isIndustryPhrase('legal')).toBe(true);
    expect(svc.isIndustryPhrase('FINTECH')).toBe(true);
  });
  it('rejects non-industries', () => {
    expect(svc.isIndustryPhrase('artificial')).toBe(false);
    expect(svc.isIndustryPhrase('claude')).toBe(false);
    expect(svc.isIndustryPhrase('')).toBe(false);
    expect(svc.isIndustryPhrase(null)).toBe(false);
  });
});

describe('keywordTrendCompute.toDisplayWord', () => {
  it('title-cases multi-word phrases', () => {
    expect(svc.toDisplayWord('it services')).toBe('It Services');
    expect(svc.toDisplayWord('healthcare')).toBe('Healthcare');
    expect(svc.toDisplayWord('artificial intelligence')).toBe('Artificial Intelligence');
  });
});

describe('keywordTrendCompute.validateMatchCount', () => {
  beforeEach(() => Opportunity.count.mockReset());
  it('returns the count from Sequelize', async () => {
    Opportunity.count.mockResolvedValue(42);
    expect(await svc.validateMatchCount('healthcare')).toBe(42);
  });
  it('returns 0 on failure', async () => {
    Opportunity.count.mockRejectedValueOnce(new Error('db'));
    expect(await svc.validateMatchCount('healthcare')).toBe(0);
  });
  it('returns 0 for empty word', async () => {
    expect(await svc.validateMatchCount('')).toBe(0);
  });
});

describe('keywordTrendCompute.validateToolCount', () => {
  beforeEach(() => AiTool.count.mockReset());
  it('returns the count from Sequelize', async () => {
    AiTool.count.mockResolvedValue(7);
    expect(await svc.validateToolCount('chat')).toBe(7);
  });
  it('returns 0 on failure', async () => {
    AiTool.count.mockRejectedValueOnce(new Error('db'));
    expect(await svc.validateToolCount('chat')).toBe(0);
  });
});

describe('keywordTrendCompute.runKeywordTrendCompute', () => {
  beforeEach(() => {
    Opportunity.count.mockReset();
    AiTool.count.mockReset();
    KeywordTrend.bulkCreate.mockReset().mockResolvedValue([]);
    KeywordTrend.update.mockReset().mockResolvedValue([0]);
    cloud.getKeywordCloud.mockReset();
  });

  it('persists only candidates that pass the validation gate', async () => {
    cloud.getKeywordCloud.mockResolvedValueOnce({
      words: [
        { word: 'healthcare',  count: 50, sentiment_score: 0.2, sentiment_label: 'positive', avg_age_days: 5, channels: [{ key: 'bonfire', count: 20 }] },
        { word: 'random_noise', count: 8, sentiment_score: 0,    sentiment_label: 'neutral',  avg_age_days: 7, channels: [] },
      ],
    });
    Opportunity.count
      .mockResolvedValueOnce(40) // healthcare → 40 matches
      .mockResolvedValueOnce(0); // random_noise → 0
    AiTool.count
      .mockResolvedValueOnce(3) // healthcare → 3 tools
      .mockResolvedValueOnce(0); // random_noise → 0

    const out = await svc.runKeywordTrendCompute();

    expect(out.persisted).toBe(1);
    expect(out.dropped).toBe(1);
    expect(KeywordTrend.bulkCreate).toHaveBeenCalledTimes(1);
    const persistedRows = KeywordTrend.bulkCreate.mock.calls[0][0];
    expect(persistedRows).toHaveLength(1);
    expect(persistedRows[0].word).toBe('healthcare');
    expect(persistedRows[0].matchCount).toBe(40);
    expect(persistedRows[0].toolCount).toBe(3);
    expect(persistedRows[0].isIndustry).toBe(true);
    expect(persistedRows[0].channelCounts).toEqual({ bonfire: 20 });
  });

  it('keeps a word that has tool matches even if opp matches < threshold', async () => {
    cloud.getKeywordCloud.mockResolvedValueOnce({
      words: [
        { word: 'rasa', count: 10, sentiment_score: 0.1, sentiment_label: 'neutral', avg_age_days: 4, channels: [] },
      ],
    });
    Opportunity.count.mockResolvedValueOnce(0);  // 0 opp matches
    AiTool.count.mockResolvedValueOnce(5);        // 5 tool matches → KEEP

    const out = await svc.runKeywordTrendCompute();
    expect(out.persisted).toBe(1);
    expect(out.dropped).toBe(0);
  });

  it('drops a word with 0 match_count AND 0 tool_count', async () => {
    cloud.getKeywordCloud.mockResolvedValueOnce({
      words: [
        { word: 'phantom', count: 5, sentiment_score: 0, sentiment_label: 'neutral', avg_age_days: 7, channels: [] },
      ],
    });
    Opportunity.count.mockResolvedValueOnce(0);
    AiTool.count.mockResolvedValueOnce(0);

    const out = await svc.runKeywordTrendCompute();
    expect(out.persisted).toBe(0);
    expect(out.dropped).toBe(1);
    expect(KeywordTrend.bulkCreate).not.toHaveBeenCalled();
  });
});
