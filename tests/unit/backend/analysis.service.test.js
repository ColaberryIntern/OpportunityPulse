// Mock logger to suppress output
jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockOpportunity = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };
  const mockAnalysisRun = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };
  const mockAlert = {
    bulkCreate: jest.fn(),
  };
  const mockUser = {
    findAll: jest.fn(),
  };
  return {
    Opportunity: mockOpportunity,
    AnalysisRun: mockAnalysisRun,
    Alert: mockAlert,
    User: mockUser,
    sequelize: {},
  };
});

// Mock AI client
const mockChat = jest.fn();
jest.mock('../../../backend/src/analysis/ai.client', () => ({
  getAIClient: jest.fn(() => ({ chat: mockChat })),
}));

// Mock prompts
jest.mock('../../../backend/src/analysis/prompts', () => ({
  SCORING_SYSTEM_PROMPT: 'mock scoring system prompt',
  TREND_SYSTEM_PROMPT: 'mock trend system prompt',
  INSIGHT_SYSTEM_PROMPT: 'mock insight system prompt',
  buildScoringUserPrompt: jest.fn().mockReturnValue('mock scoring user prompt'),
  buildTrendUserPrompt: jest.fn().mockReturnValue('mock trend user prompt'),
  buildInsightUserPrompt: jest.fn().mockReturnValue('mock insight user prompt'),
}));

const { Opportunity, AnalysisRun, Alert, User } = require('../../../backend/src/models');
const analysisService = require('../../../backend/src/analysis/analysis.service');
const logger = require('../../../backend/src/logging/logger');

describe('AnalysisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeMockRun(overrides = {}) {
    const run = {
      id: 1,
      type: 'scoring',
      status: 'running',
      opportunityType: null,
      inputCount: null,
      outputCount: null,
      results: null,
      errors: null,
      tokensUsed: null,
      completedAt: null,
      update: jest.fn().mockImplementation(function (data) {
        Object.assign(this, data);
        return Promise.resolve(this);
      }),
      ...overrides,
    };
    return run;
  }

  function makeMockOpportunities() {
    return [
      {
        id: 1,
        title: 'Test Opp 1',
        type: 'ai_job',
        description: 'desc',
        category: 'ML',
        value: 100000,
        update: jest.fn().mockResolvedValue(),
      },
      {
        id: 2,
        title: 'Test Opp 2',
        type: 'ai_job',
        description: 'desc',
        category: 'NLP',
        value: 200000,
        update: jest.fn().mockResolvedValue(),
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // scoreOpportunities
  // ---------------------------------------------------------------------------
  describe('scoreOpportunities', () => {
    it('should throw AppError(400) for invalid type', async () => {
      await expect(analysisService.scoreOpportunities('invalid_type'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('should return run with success status and 0 counts when no unscored opportunities found', async () => {
      const mockRun = makeMockRun({ type: 'scoring', opportunityType: 'ai_job' });
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockResolvedValue([]);

      const result = await analysisService.scoreOpportunities('ai_job');

      expect(result.status).toBe('success');
      expect(result.inputCount).toBe(0);
      expect(result.outputCount).toBe(0);
      expect(result.results).toEqual({ message: 'No unscored opportunities found.' });
      expect(mockChat).not.toHaveBeenCalled();
    });

    it('should score opportunities successfully and update aiScore/aiAnalysis', async () => {
      const mockRun = makeMockRun({ type: 'scoring', opportunityType: 'ai_job' });
      const mockOpps = makeMockOpportunities();
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockResolvedValue(mockOpps);

      const mockAiResponse = JSON.stringify({
        scores: [
          { id: 1, score: 75, reasoning: 'Good fit', highlights: ['demand'] },
          { id: 2, score: 60, reasoning: 'Moderate value', highlights: [] },
        ],
      });
      mockChat.mockResolvedValue({ content: mockAiResponse, tokensUsed: 500 });

      // No users for alerts (scores below 80)
      User.findAll.mockResolvedValue([]);
      Alert.bulkCreate.mockResolvedValue([]);

      const result = await analysisService.scoreOpportunities('ai_job');

      expect(mockOpps[0].update).toHaveBeenCalledWith(
        expect.objectContaining({
          aiScore: 75,
          aiAnalysis: expect.objectContaining({
            score: 75,
            reasoning: 'Good fit',
            highlights: ['demand'],
          }),
        })
      );
      expect(mockOpps[1].update).toHaveBeenCalledWith(
        expect.objectContaining({
          aiScore: 60,
          aiAnalysis: expect.objectContaining({
            score: 60,
            reasoning: 'Moderate value',
          }),
        })
      );
      expect(result.status).toBe('success');
      expect(result.outputCount).toBe(2);
      expect(result.tokensUsed).toBe(500);
    });

    it('should create alerts for high-score opportunities (score >= 80)', async () => {
      const mockRun = makeMockRun({ type: 'scoring', opportunityType: 'ai_job' });
      const mockOpps = makeMockOpportunities();
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockResolvedValue(mockOpps);

      const mockAiResponse = JSON.stringify({
        scores: [
          { id: 1, score: 85, reasoning: 'Strong market fit', highlights: ['high demand'] },
          { id: 2, score: 60, reasoning: 'Moderate value', highlights: [] },
        ],
      });
      mockChat.mockResolvedValue({ content: mockAiResponse, tokensUsed: 500 });

      const mockUsers = [{ id: 10 }, { id: 20 }];
      User.findAll.mockResolvedValue(mockUsers);
      Alert.bulkCreate.mockResolvedValue([]);

      const result = await analysisService.scoreOpportunities('ai_job');

      expect(Alert.bulkCreate).toHaveBeenCalledTimes(1);
      const alertRecords = Alert.bulkCreate.mock.calls[0][0];
      // 1 high-score opp * 2 users = 2 alerts
      expect(alertRecords).toHaveLength(2);
      expect(alertRecords[0]).toMatchObject({
        userId: 10,
        type: 'new_opportunity',
        opportunityId: 1,
        severity: 'info',
      });
      expect(alertRecords[1]).toMatchObject({
        userId: 20,
        opportunityId: 1,
      });
      expect(result.results.highScoreCount).toBe(1);
    });

    it('should not create alerts when no high scores', async () => {
      const mockRun = makeMockRun({ type: 'scoring', opportunityType: 'ai_job' });
      const mockOpps = makeMockOpportunities();
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockResolvedValue(mockOpps);

      const mockAiResponse = JSON.stringify({
        scores: [
          { id: 1, score: 50, reasoning: 'Low', highlights: [] },
          { id: 2, score: 40, reasoning: 'Low', highlights: [] },
        ],
      });
      mockChat.mockResolvedValue({ content: mockAiResponse, tokensUsed: 300 });

      const result = await analysisService.scoreOpportunities('ai_job');

      expect(Alert.bulkCreate).not.toHaveBeenCalled();
      expect(User.findAll).not.toHaveBeenCalled();
      expect(result.results.highScoreCount).toBe(0);
    });

    it('should clamp scores to 0-100 range', async () => {
      const mockRun = makeMockRun({ type: 'scoring', opportunityType: 'ai_job' });
      const mockOpps = makeMockOpportunities();
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockResolvedValue(mockOpps);

      const mockAiResponse = JSON.stringify({
        scores: [
          { id: 1, score: 150, reasoning: 'Over max', highlights: [] },
          { id: 2, score: -20, reasoning: 'Under min', highlights: [] },
        ],
      });
      mockChat.mockResolvedValue({ content: mockAiResponse, tokensUsed: 400 });

      // Score 150 clamps to 100 which is >= 80, so alerts will trigger
      User.findAll.mockResolvedValue([]);
      Alert.bulkCreate.mockResolvedValue([]);

      await analysisService.scoreOpportunities('ai_job');

      expect(mockOpps[0].update).toHaveBeenCalledWith(
        expect.objectContaining({ aiScore: 100 })
      );
      expect(mockOpps[1].update).toHaveBeenCalledWith(
        expect.objectContaining({ aiScore: 0 })
      );
    });

    it('should set status to partial when some updates fail', async () => {
      const mockRun = makeMockRun({ type: 'scoring', opportunityType: 'ai_job' });
      const mockOpps = makeMockOpportunities();
      // Make second opp's update fail
      mockOpps[1].update.mockRejectedValue(new Error('DB write error'));
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockResolvedValue(mockOpps);

      const mockAiResponse = JSON.stringify({
        scores: [
          { id: 1, score: 70, reasoning: 'Ok', highlights: [] },
          { id: 2, score: 65, reasoning: 'Moderate', highlights: [] },
        ],
      });
      mockChat.mockResolvedValue({ content: mockAiResponse, tokensUsed: 400 });

      const result = await analysisService.scoreOpportunities('ai_job');

      expect(result.status).toBe('partial');
      expect(result.outputCount).toBe(1);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ opportunityId: 2, error: 'DB write error' }),
        ])
      );
    });

    it('should set status to failed and throw AppError(500) when AI client throws', async () => {
      const mockRun = makeMockRun({ type: 'scoring', opportunityType: 'ai_job' });
      const mockOpps = makeMockOpportunities();
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockResolvedValue(mockOpps);

      mockChat.mockRejectedValue(new Error('OpenAI API timeout'));

      await expect(analysisService.scoreOpportunities('ai_job'))
        .rejects.toMatchObject({ statusCode: 500 });

      expect(mockRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errors: [{ error: expect.stringContaining('OpenAI API timeout') }],
        })
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // detectTrends
  // ---------------------------------------------------------------------------
  describe('detectTrends', () => {
    it('should throw AppError(400) for invalid type', async () => {
      await expect(analysisService.detectTrends('bad_type'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('should return run with empty trends when no recent opportunities', async () => {
      const mockRun = makeMockRun({ type: 'trend_detection', opportunityType: 'gov_contract' });
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockResolvedValue([]);

      const result = await analysisService.detectTrends('gov_contract');

      expect(result.status).toBe('success');
      expect(result.inputCount).toBe(0);
      expect(result.outputCount).toBe(0);
      expect(result.results).toEqual({
        message: 'No recent opportunities for trend analysis.',
        trends: [],
      });
      expect(mockChat).not.toHaveBeenCalled();
    });

    it('should detect trends successfully and store results', async () => {
      const mockRun = makeMockRun({ type: 'trend_detection', opportunityType: 'gov_contract' });
      AnalysisRun.create.mockResolvedValue(mockRun);

      const recentOpps = [
        { id: 1, category: 'IT', value: 50000, status: 'active', aiScore: 80, createdAt: new Date(), tags: ['cloud'] },
        { id: 2, category: 'IT', value: 75000, status: 'active', aiScore: 70, createdAt: new Date(), tags: ['ai'] },
      ];
      Opportunity.findAll.mockResolvedValue(recentOpps);

      const trendResponse = {
        trends: [
          { name: 'Rising IT demand', direction: 'up', confidence: 0.85 },
        ],
      };
      mockChat.mockResolvedValue({ content: JSON.stringify(trendResponse), tokensUsed: 350 });

      const result = await analysisService.detectTrends('gov_contract');

      expect(result.status).toBe('success');
      expect(result.inputCount).toBe(2);
      expect(result.outputCount).toBe(1);
      expect(result.results).toEqual(trendResponse);
      expect(result.tokensUsed).toBe(350);
    });

    it('should set status to failed when AI client throws', async () => {
      const mockRun = makeMockRun({ type: 'trend_detection', opportunityType: 'investment' });
      AnalysisRun.create.mockResolvedValue(mockRun);

      const recentOpps = [
        { id: 1, category: 'VC', value: 100000, status: 'active', aiScore: null, createdAt: new Date(), tags: [] },
      ];
      Opportunity.findAll.mockResolvedValue(recentOpps);

      mockChat.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(analysisService.detectTrends('investment'))
        .rejects.toMatchObject({ statusCode: 500 });

      expect(mockRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errors: [{ error: expect.stringContaining('Rate limit exceeded') }],
        })
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // generateInsights
  // ---------------------------------------------------------------------------
  describe('generateInsights', () => {
    it('should return run with no-data message when inputCount is 0', async () => {
      const mockRun = makeMockRun({ type: 'insight_generation' });
      AnalysisRun.create.mockResolvedValue(mockRun);

      // scoredCount = 0
      Opportunity.count.mockResolvedValue(0);
      // avgScore query
      Opportunity.findOne.mockResolvedValue({ avgScore: null });
      // latestTrends = empty
      AnalysisRun.findAll.mockResolvedValue([]);
      // topOpps = empty (second call to Opportunity.findAll)
      Opportunity.findAll.mockResolvedValue([]);

      const result = await analysisService.generateInsights();

      expect(result.status).toBe('success');
      expect(result.inputCount).toBe(0);
      expect(result.results).toEqual({ message: 'No data available for insight generation.' });
      expect(mockChat).not.toHaveBeenCalled();
    });

    it('should generate insights successfully', async () => {
      const mockRun = makeMockRun({ type: 'insight_generation' });
      AnalysisRun.create.mockResolvedValue(mockRun);

      // scoredCount = 5
      Opportunity.count.mockResolvedValue(5);
      // avgScore
      Opportunity.findOne.mockResolvedValue({ avgScore: '72.5' });
      // latestTrends = 2 trend runs
      const trendRuns = [
        { opportunityType: 'ai_job', results: { trends: [{ name: 'AI growth' }] } },
        { opportunityType: 'gov_contract', results: { trends: [{ name: 'Budget increase' }] } },
      ];
      AnalysisRun.findAll.mockResolvedValue(trendRuns);
      // topOpps = 3 opportunities
      const topOpps = [
        { id: 1, type: 'ai_job', title: 'ML Lead', aiScore: 95, category: 'ML', value: 200000 },
        { id: 2, type: 'gov_contract', title: 'Fed AI', aiScore: 90, category: 'IT', value: 500000 },
        { id: 3, type: 'investment', title: 'Startup X', aiScore: 88, category: 'VC', value: 1000000 },
      ];
      Opportunity.findAll.mockResolvedValue(topOpps);

      const insightResponse = {
        summary: 'Market is trending strongly toward AI opportunities.',
        recommendations: ['Focus on ML roles', 'Monitor gov contracts'],
      };
      mockChat.mockResolvedValue({ content: JSON.stringify(insightResponse), tokensUsed: 800 });

      const result = await analysisService.generateInsights();

      // inputCount = scoredCount(5) + latestTrends.length(2) + topOpps.length(3) = 10
      expect(result.status).toBe('success');
      expect(result.inputCount).toBe(10);
      expect(result.outputCount).toBe(1);
      expect(result.results).toEqual(insightResponse);
      expect(result.tokensUsed).toBe(800);
    });

    it('should set status to failed when AI client throws', async () => {
      const mockRun = makeMockRun({ type: 'insight_generation' });
      AnalysisRun.create.mockResolvedValue(mockRun);

      Opportunity.count.mockResolvedValue(3);
      Opportunity.findOne.mockResolvedValue({ avgScore: '65.0' });
      AnalysisRun.findAll.mockResolvedValue([]);
      Opportunity.findAll.mockResolvedValue([
        { id: 1, type: 'ai_job', title: 'Engineer', aiScore: 80, category: 'ML', value: 150000 },
      ]);

      mockChat.mockRejectedValue(new Error('Service unavailable'));

      await expect(analysisService.generateInsights())
        .rejects.toMatchObject({ statusCode: 500 });

      expect(mockRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errors: [{ error: expect.stringContaining('Service unavailable') }],
        })
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getLatestInsights
  // ---------------------------------------------------------------------------
  describe('getLatestInsights', () => {
    it('should return the latest insight run or null', async () => {
      const mockInsightRun = {
        id: 5,
        type: 'insight_generation',
        status: 'success',
        results: { summary: 'All good' },
      };
      AnalysisRun.findOne.mockResolvedValue(mockInsightRun);

      const result = await analysisService.getLatestInsights();

      expect(result).toEqual(mockInsightRun);
      expect(AnalysisRun.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: 'insight_generation', status: 'success' },
          order: [['started_at', 'DESC']],
        })
      );
    });

    it('should return null when no insight runs exist', async () => {
      AnalysisRun.findOne.mockResolvedValue(null);

      const result = await analysisService.getLatestInsights();

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getLatestTrends
  // ---------------------------------------------------------------------------
  describe('getLatestTrends', () => {
    it('should return the latest trend run for a type', async () => {
      const mockTrendRun = {
        id: 3,
        type: 'trend_detection',
        status: 'success',
        opportunityType: 'ai_job',
        results: { trends: [{ name: 'AI boom' }] },
      };
      AnalysisRun.findOne.mockResolvedValue(mockTrendRun);

      const result = await analysisService.getLatestTrends('ai_job');

      expect(result).toEqual(mockTrendRun);
      expect(AnalysisRun.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: 'trend_detection', status: 'success', opportunityType: 'ai_job' },
          order: [['started_at', 'DESC']],
        })
      );
    });

    it('should throw AppError(400) for invalid type in getLatestTrends', async () => {
      await expect(analysisService.getLatestTrends('not_a_type'))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
