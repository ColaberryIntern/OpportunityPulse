const mockChat = jest.fn();

// Mock AI client with persistent chat mock
jest.mock('../../../backend/src/analysis/ai.client', () => ({
  getAIClient: jest.fn(() => ({
    chat: mockChat,
  })),
}));

// Mock models
jest.mock('../../../backend/src/models', () => {
  return {
    Content: { create: jest.fn(), findAndCountAll: jest.fn(), findByPk: jest.fn() },
    User: {},
  };
});

const contentService = require('../../../backend/src/contentManager/content.service');

describe('Content Generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateContent', () => {
    it('should generate content from a topic using AI', async () => {
      const mockAIResponse = {
        content: JSON.stringify({
          title: 'AI Trends in Federal Contracting',
          body: 'The federal government is increasingly...',
          category: 'gov_contracts',
          tags: ['AI', 'federal', 'contracting'],
        }),
        tokensUsed: 500,
      };
      mockChat.mockResolvedValue(mockAIResponse);

      const result = await contentService.generateContent('AI trends in federal contracting');

      expect(result.title).toBe('AI Trends in Federal Contracting');
      expect(result.body).toContain('federal government');
      expect(result.category).toBe('gov_contracts');
      expect(result.tags).toEqual(['AI', 'federal', 'contracting']);
    });

    it('should use temperature 0.7 for creative output', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ title: 'Test', body: 'Body', category: 'industry', tags: [] }),
        tokensUsed: 100,
      });

      await contentService.generateContent('any topic');

      expect(mockChat).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('any topic'),
        expect.objectContaining({ temperature: 0.7 })
      );
    });

    it('should handle unparseable AI response gracefully', async () => {
      mockChat.mockResolvedValue({
        content: 'This is not valid JSON but is good content about AI.',
        tokensUsed: 200,
      });

      const result = await contentService.generateContent('AI overview');

      expect(result.title).toBe('AI overview');
      expect(result.body).toContain('not valid JSON');
      expect(result.category).toBe('industry');
    });

    it('should return empty tags array when AI returns non-array', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ title: 'Test', body: 'Body', tags: 'not-an-array' }),
        tokensUsed: 100,
      });

      const result = await contentService.generateContent('topic');

      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags).toEqual([]);
    });

    it('should fallback title to topic when AI omits it', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ body: 'Some content here' }),
        tokensUsed: 100,
      });

      const result = await contentService.generateContent('my specific topic');

      expect(result.title).toBe('my specific topic');
    });
  });
});
