// Mock models and AI client before importing service
jest.mock('../../../backend/src/models', () => {
  const mockContent = {
    findAndCountAll: jest.fn(),
  };
  const mockOpportunity = {
    findAll: jest.fn(),
  };
  const mockUser = {};
  return { Content: mockContent, Opportunity: mockOpportunity, User: mockUser };
});

const mockChat = jest.fn();
jest.mock('../../../backend/src/analysis/ai.client', () => ({
  getAIClient: jest.fn(() => ({
    chat: mockChat,
  })),
}));

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const { Opportunity } = require('../../../backend/src/models');
const searchService = require('../../../backend/src/search/search.service');

describe('Natural Language Search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('naturalLanguageSearch', () => {
    it('should parse NL query via AI and return filtered opportunities', async () => {
      const mockAIResponse = {
        content: JSON.stringify({
          type: 'gov_contract',
          keywords: ['AI', 'defense'],
          location: 'Virginia',
        }),
        tokensUsed: 150,
      };
      mockChat.mockResolvedValue(mockAIResponse);

      const mockResults = [
        { id: 1, title: 'AI Defense Contract in VA', type: 'gov_contract', aiScore: 92 },
      ];
      Opportunity.findAll.mockResolvedValue(mockResults);

      const result = await searchService.naturalLanguageSearch('Find AI defense contracts in Virginia');

      expect(result.results).toEqual(mockResults);
      expect(result.originalQuery).toBe('Find AI defense contracts in Virginia');
      expect(result.filters).toHaveProperty('type', 'gov_contract');
      expect(result.filters).toHaveProperty('location', 'Virginia');
    });

    it('should handle AI returning empty/unparseable JSON gracefully', async () => {
      mockChat.mockResolvedValue({ content: 'not json', tokensUsed: 50 });
      Opportunity.findAll.mockResolvedValue([]);

      const result = await searchService.naturalLanguageSearch('vague query');

      expect(result.results).toEqual([]);
      expect(result.filters).toEqual({});
    });

    it('should handle AI returning empty object for vague queries', async () => {
      mockChat.mockResolvedValue({ content: '{}', tokensUsed: 50 });
      Opportunity.findAll.mockResolvedValue([]);

      const result = await searchService.naturalLanguageSearch('stuff');

      expect(result.filters).toEqual({});
    });

    it('should extract minValue filter from AI response', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ type: 'gov_contract', minValue: 1000000 }),
        tokensUsed: 100,
      });
      Opportunity.findAll.mockResolvedValue([]);

      const result = await searchService.naturalLanguageSearch('contracts over $1M');

      expect(result.filters.minValue).toBe(1000000);
    });

    it('should limit results to 20', async () => {
      mockChat.mockResolvedValue({ content: '{}', tokensUsed: 50 });
      Opportunity.findAll.mockResolvedValue([]);

      await searchService.naturalLanguageSearch('all opportunities');

      expect(Opportunity.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20 })
      );
    });

    it('should order results by AI score descending', async () => {
      mockChat.mockResolvedValue({ content: '{}', tokensUsed: 50 });
      Opportunity.findAll.mockResolvedValue([]);

      await searchService.naturalLanguageSearch('any query');

      expect(Opportunity.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['ai_score', 'DESC NULLS LAST']],
        })
      );
    });
  });
});
