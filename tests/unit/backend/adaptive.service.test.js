// Mock models
const mockActivityFindAll = jest.fn();
const mockBehaviorProfileFindOne = jest.fn();
const mockBehaviorProfileUpsert = jest.fn();
const mockUserActivityCreate = jest.fn();

jest.mock('../../../backend/src/models', () => ({
  UserActivity: {
    findAll: (...args) => mockActivityFindAll(...args),
    create: (...args) => mockUserActivityCreate(...args),
  },
  BehaviorProfile: {
    findOne: (...args) => mockBehaviorProfileFindOne(...args),
    upsert: (...args) => mockBehaviorProfileUpsert(...args),
  },
}));

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const adaptiveService = require('../../../backend/src/adaptive/adaptive.service');

describe('Adaptive Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recencyWeight', () => {
    it('should return 1.0 for current date (within floating point tolerance)', () => {
      const now = new Date();
      const weight = adaptiveService.recencyWeight(now);
      // For the current date, daysAgo is ~0, so 0.95^0 = 1.0
      expect(weight).toBeCloseTo(1.0, 2);
    });

    it('should return less than 1.0 for a date 10 days ago', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
      const weight = adaptiveService.recencyWeight(tenDaysAgo);
      // 0.95^10 ≈ 0.5987
      expect(weight).toBeLessThan(1.0);
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeCloseTo(Math.pow(0.95, 10), 2);
    });
  });

  describe('computeBehaviorProfile', () => {
    it('should produce weighted scores correctly from mock activities', async () => {
      mockActivityFindAll.mockResolvedValue([
        { action: 'opportunity_view', metadata: { opportunityType: 'gov_contract', category: 'defense' }, createdAt: new Date() },
        { action: 'opportunity_click', metadata: { opportunityType: 'gov_contract' }, createdAt: new Date() },
        { action: 'search_query', metadata: { query: 'AI contracts defense' }, createdAt: new Date() },
      ]);
      mockBehaviorProfileUpsert.mockImplementation(async (data) => [data]);

      const result = await adaptiveService.computeBehaviorProfile('user-1');

      expect(mockActivityFindAll).toHaveBeenCalledTimes(1);
      expect(mockBehaviorProfileUpsert).toHaveBeenCalledTimes(1);

      const upsertData = mockBehaviorProfileUpsert.mock.calls[0][0];
      expect(upsertData.userId).toBe('user-1');
      // gov_contract should appear in interestScores (from view + click)
      expect(upsertData.interestScores).toHaveProperty('gov_contract');
      // defense should appear in categoryPreferences (from the view)
      expect(upsertData.categoryPreferences).toHaveProperty('defense');
      // search patterns should capture the query
      expect(upsertData.searchPatterns.recentQueries).toContain('AI contracts defense');
      // engagement metrics should reflect the activities
      expect(upsertData.engagementMetrics.totalViews).toBe(1);
      expect(upsertData.engagementMetrics.totalClicks).toBe(1);
    });

    it('should normalize scores to 0-1 range', async () => {
      mockActivityFindAll.mockResolvedValue([
        { action: 'opportunity_view', metadata: { opportunityType: 'gov_contract', category: 'defense' }, createdAt: new Date() },
        { action: 'opportunity_view', metadata: { opportunityType: 'gov_contract', category: 'defense' }, createdAt: new Date() },
        { action: 'opportunity_view', metadata: { opportunityType: 'private_sector', category: 'tech' }, createdAt: new Date() },
        { action: 'opportunity_click', metadata: { opportunityType: 'gov_contract' }, createdAt: new Date() },
      ]);
      mockBehaviorProfileUpsert.mockImplementation(async (data) => [data]);

      await adaptiveService.computeBehaviorProfile('user-2');

      const upsertData = mockBehaviorProfileUpsert.mock.calls[0][0];

      // All interest scores should be between 0 and 1
      for (const score of Object.values(upsertData.interestScores)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }

      // All category preferences should be between 0 and 1
      for (const score of Object.values(upsertData.categoryPreferences)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }

      // The highest scored item should be normalized to 1.0
      const maxInterest = Math.max(...Object.values(upsertData.interestScores));
      expect(maxInterest).toBeCloseTo(1.0, 3);
    });

    it('should handle empty activity list and return empty/default scores', async () => {
      mockActivityFindAll.mockResolvedValue([]);
      mockBehaviorProfileUpsert.mockImplementation(async (data) => [data]);

      await adaptiveService.computeBehaviorProfile('user-3');

      const upsertData = mockBehaviorProfileUpsert.mock.calls[0][0];

      expect(upsertData.interestScores).toEqual({});
      expect(upsertData.categoryPreferences).toEqual({});
      expect(upsertData.tagAffinities).toEqual({});
      expect(upsertData.searchPatterns.recentQueries).toEqual([]);
      expect(upsertData.searchPatterns.topTerms).toEqual({});
      expect(upsertData.engagementMetrics.totalViews).toBe(0);
      expect(upsertData.engagementMetrics.totalClicks).toBe(0);
      expect(upsertData.engagementMetrics.avgTimeSpent).toBe(0);
    });
  });

  describe('getBehaviorProfile', () => {
    it('should return existing profile if fresh (lastComputedAt within 1 hour)', async () => {
      const freshProfile = {
        userId: 'user-4',
        interestScores: { gov_contract: 1.0 },
        categoryPreferences: { defense: 0.8 },
        tagAffinities: {},
        searchPatterns: { recentQueries: [], topTerms: {} },
        engagementMetrics: { avgTimeSpent: 0, totalViews: 5, totalClicks: 2 },
        lastComputedAt: new Date(), // Just now — fresh
      };
      mockBehaviorProfileFindOne.mockResolvedValue(freshProfile);

      const result = await adaptiveService.getBehaviorProfile('user-4');

      expect(mockBehaviorProfileFindOne).toHaveBeenCalledTimes(1);
      // Should NOT recompute — no findAll or upsert calls
      expect(mockActivityFindAll).not.toHaveBeenCalled();
      expect(mockBehaviorProfileUpsert).not.toHaveBeenCalled();
      expect(result).toBe(freshProfile);
    });

    it('should recompute if profile is stale (lastComputedAt > 1 hour ago)', async () => {
      const staleProfile = {
        userId: 'user-5',
        interestScores: { gov_contract: 0.5 },
        categoryPreferences: {},
        tagAffinities: {},
        searchPatterns: { recentQueries: [], topTerms: {} },
        engagementMetrics: { avgTimeSpent: 0, totalViews: 1, totalClicks: 0 },
        lastComputedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago — stale
      };
      mockBehaviorProfileFindOne.mockResolvedValue(staleProfile);
      mockActivityFindAll.mockResolvedValue([]);
      mockBehaviorProfileUpsert.mockImplementation(async (data) => [data]);

      await adaptiveService.getBehaviorProfile('user-5');

      // Should recompute — findAll and upsert should be called
      expect(mockActivityFindAll).toHaveBeenCalledTimes(1);
      expect(mockBehaviorProfileUpsert).toHaveBeenCalledTimes(1);
    });

    it('should recompute if no profile exists', async () => {
      mockBehaviorProfileFindOne.mockResolvedValue(null);
      mockActivityFindAll.mockResolvedValue([]);
      mockBehaviorProfileUpsert.mockImplementation(async (data) => [data]);

      await adaptiveService.getBehaviorProfile('user-6');

      // Should recompute since no profile exists
      expect(mockActivityFindAll).toHaveBeenCalledTimes(1);
      expect(mockBehaviorProfileUpsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('trackBehavior', () => {
    it('should create a UserActivity record', async () => {
      mockUserActivityCreate.mockResolvedValue({ id: 1 });

      await adaptiveService.trackBehavior('user-7', 'opportunity_view', { opportunityType: 'gov_contract' });

      expect(mockUserActivityCreate).toHaveBeenCalledTimes(1);
      expect(mockUserActivityCreate).toHaveBeenCalledWith({
        userId: 'user-7',
        action: 'opportunity_view',
        metadata: { opportunityType: 'gov_contract' },
      });
    });
  });

  describe('getAdaptiveLearning', () => {
    it('should return correct shape with all expected keys', async () => {
      const freshProfile = {
        userId: 'user-8',
        interestScores: { gov_contract: 1.0 },
        categoryPreferences: { defense: 0.8 },
        tagAffinities: { ai: 0.5 },
        searchPatterns: { recentQueries: ['AI contracts'], topTerms: { ai: 1.0 } },
        engagementMetrics: { avgTimeSpent: 120, totalViews: 10, totalClicks: 5 },
        lastComputedAt: new Date(),
      };
      mockBehaviorProfileFindOne.mockResolvedValue(freshProfile);

      const result = await adaptiveService.getAdaptiveLearning('user-8');

      expect(result).toHaveProperty('interestScores');
      expect(result).toHaveProperty('categoryPreferences');
      expect(result).toHaveProperty('tagAffinities');
      expect(result).toHaveProperty('searchPatterns');
      expect(result).toHaveProperty('engagementMetrics');
      expect(result).toHaveProperty('lastComputedAt');

      expect(result.interestScores).toEqual({ gov_contract: 1.0 });
      expect(result.categoryPreferences).toEqual({ defense: 0.8 });
      expect(result.tagAffinities).toEqual({ ai: 0.5 });
      expect(result.searchPatterns.recentQueries).toContain('AI contracts');
      expect(result.engagementMetrics.totalViews).toBe(10);
      expect(result.engagementMetrics.totalClicks).toBe(5);
    });
  });
});
