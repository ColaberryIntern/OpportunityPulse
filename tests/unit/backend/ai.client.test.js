// Mock OpenAI before importing module
jest.mock('openai', () => {
  const mockCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

// Mock logger to suppress output
jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Set API key before requiring the module under test
process.env.OPENAI_API_KEY = 'test-key';

const OpenAI = require('openai');
const logger = require('../../../backend/src/logging/logger');
const { AIClient, getAIClient, resetAIClient } = require('../../../backend/src/analysis/ai.client');

describe('AIClient', () => {
  let mockCreate;

  beforeEach(() => {
    jest.clearAllMocks();
    resetAIClient();
    process.env.OPENAI_API_KEY = 'test-key';

    // Get reference to the mock create function from the OpenAI mock
    mockCreate = OpenAI.mock.results[0]?.value?.chat?.completions?.create || jest.fn();
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('should throw when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      resetAIClient();

      expect(() => getAIClient()).toThrow(
        'OPENAI_API_KEY environment variable is required for AI analysis.'
      );
    });

    it('should create client when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      resetAIClient();

      expect(() => getAIClient()).not.toThrow();

      const client = getAIClient();
      expect(client).toBeInstanceOf(AIClient);
      expect(client.model).toBe('gpt-4o-mini');
    });
  });

  // ---------------------------------------------------------------------------
  // chat
  // ---------------------------------------------------------------------------
  describe('chat', () => {
    it('should return content and tokensUsed on success', async () => {
      const client = getAIClient();
      const mockCreate = client.client.chat.completions.create;

      const mockResponse = {
        choices: [{ message: { content: '{"result":"ok"}' } }],
        usage: {
          total_tokens: 150,
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      };
      mockCreate.mockResolvedValue(mockResponse);

      const result = await client.chat('You are a helper.', 'Analyze this.');

      expect(result).toEqual({
        content: '{"result":"ok"}',
        tokensUsed: 150,
      });
      expect(logger.info).toHaveBeenCalledWith(
        'OpenAI API call completed',
        expect.objectContaining({
          model: 'gpt-4o-mini',
          tokensUsed: 150,
          promptTokens: 100,
          completionTokens: 50,
        })
      );
    });

    it('should use default temperature=0.3 and maxTokens=2000', async () => {
      const client = getAIClient();
      const mockCreate = client.client.chat.completions.create;

      const mockResponse = {
        choices: [{ message: { content: '{}' } }],
        usage: { total_tokens: 50 },
      };
      mockCreate.mockResolvedValue(mockResponse);

      await client.chat('system prompt', 'user prompt');

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user prompt' },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });
    });

    it('should throw and log on API error', async () => {
      const client = getAIClient();
      const mockCreate = client.client.chat.completions.create;

      const apiError = new Error('Rate limit exceeded');
      apiError.status = 429;
      mockCreate.mockRejectedValue(apiError);

      await expect(client.chat('system', 'user')).rejects.toThrow('Rate limit exceeded');

      expect(logger.error).toHaveBeenCalledWith(
        'OpenAI API error',
        expect.objectContaining({
          error: 'Rate limit exceeded',
          status: 429,
        })
      );
    });
  });
});
