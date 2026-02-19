// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockOpportunity = {
    findAll: jest.fn(),
  };
  const mockDataSource = {};
  const mockUser = {
    findByPk: jest.fn(),
  };
  return { Opportunity: mockOpportunity, DataSource: mockDataSource, User: mockUser };
});

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const { Opportunity, User } = require('../../../backend/src/models');
const recommendationService = require('../../../backend/src/recommendations/recommendation.service');

describe('RecommendationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecommendations', () => {
    it('should return top AI-scored opportunities when user has no interests', async () => {
      User.findByPk.mockResolvedValue({ id: 1, interests: null });
      const mockOpps = [
        { id: 1, title: 'AI Contract', type: 'gov_contract', aiScore: 95 },
        { id: 2, title: 'ML Job', type: 'ai_job', aiScore: 88 },
      ];
      Opportunity.findAll.mockResolvedValue(mockOpps);

      const result = await recommendationService.getRecommendations(1, { limit: 10 });

      expect(result.recommendations).toEqual(mockOpps);
      expect(result.interests).toEqual([]);
      expect(result.total).toBe(2);
    });

    it('should filter by user interests when present', async () => {
      User.findByPk.mockResolvedValue({ id: 1, interests: 'AI, defense' });
      const matchedOpps = [
        { id: 1, title: 'AI Defense Contract', type: 'gov_contract', aiScore: 95 },
      ];
      Opportunity.findAll.mockResolvedValue(matchedOpps);

      const result = await recommendationService.getRecommendations(1, { limit: 10 });

      expect(result.interests).toEqual(['AI', 'defense']);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    });

    it('should fill remaining slots with top-scored opportunities when interest matches are insufficient', async () => {
      User.findByPk.mockResolvedValue({ id: 1, interests: 'niche_topic' });
      const interestMatched = [{ id: 1, title: 'Niche', aiScore: 80 }];
      const topScored = [{ id: 2, title: 'Top Scored', aiScore: 95 }];
      Opportunity.findAll
        .mockResolvedValueOnce(interestMatched) // first call: interest-matched
        .mockResolvedValueOnce(topScored); // second call: fill remaining

      const result = await recommendationService.getRecommendations(1, { limit: 5 });

      expect(result.recommendations.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should respect the limit parameter', async () => {
      User.findByPk.mockResolvedValue({ id: 1, interests: null });
      Opportunity.findAll.mockResolvedValue([]);

      await recommendationService.getRecommendations(1, { limit: 5 });

      expect(Opportunity.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 })
      );
    });

    it('should cap limit at 20', async () => {
      User.findByPk.mockResolvedValue({ id: 1, interests: null });
      Opportunity.findAll.mockResolvedValue([]);

      await recommendationService.getRecommendations(1, { limit: 100 });

      expect(Opportunity.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20 })
      );
    });

    it('should handle user not found gracefully', async () => {
      User.findByPk.mockResolvedValue(null);
      Opportunity.findAll.mockResolvedValue([]);

      const result = await recommendationService.getRecommendations(999, { limit: 10 });

      expect(result.interests).toEqual([]);
      expect(result.recommendations).toEqual([]);
    });
  });
});
