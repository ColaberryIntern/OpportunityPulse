const OpenAI = require('openai');
const logger = require('../logging/logger');

class AIClient {
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for AI analysis.');
    }
    this.client = new OpenAI({ apiKey });
    this.model = 'gpt-4o-mini'; // Cost-effective for structured analysis
  }

  async chat(systemPrompt, userPrompt, options = {}) {
    const { temperature = 0.3, maxTokens = 2000 } = options;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      const tokensUsed = response.usage?.total_tokens || 0;

      logger.info('OpenAI API call completed', {
        model: this.model,
        tokensUsed,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
      });

      return { content, tokensUsed };
    } catch (error) {
      logger.error('OpenAI API error', { error: error.message, status: error.status });
      throw error;
    }
  }
}

// Lazy singleton — only instantiate when first called
let instance = null;
function getAIClient() {
  if (!instance) {
    instance = new AIClient();
  }
  return instance;
}

// For testing — reset singleton
function resetAIClient() {
  instance = null;
}

module.exports = { AIClient, getAIClient, resetAIClient };
