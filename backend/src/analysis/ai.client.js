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

  // v0.10 — vision-capable variant. Used by the portal-screenshot extractor
  // to read the "Required Information" table off a Bonfire portal page that
  // we can't scrape due to Cloudflare bot-fight-mode. Image arrives as a
  // Buffer (multer in-memory upload); we base64 it into a data URL.
  // gpt-4o-mini supports vision and is the same cheap model we use elsewhere.
  async chatVision(systemPrompt, userText, imageBuffer, options = {}) {
    const {
      temperature = 0,
      maxTokens = 2000,
      responseFormat = 'json_object',
      mime = 'image/png',
    } = options;
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('chatVision: imageBuffer must be a Buffer');
    }
    const dataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;
    const fmt = responseFormat === 'text' ? undefined : { type: responseFormat };
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(fmt ? { response_format: fmt } : {}),
      });
      const content = response.choices[0].message.content;
      const tokensUsed = response.usage?.total_tokens || 0;
      logger.info('OpenAI vision call completed', {
        model: this.model,
        tokensUsed,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        imageBytes: imageBuffer.length,
      });
      return { content, tokensUsed };
    } catch (error) {
      logger.error('OpenAI vision API error', { error: error.message, status: error.status });
      throw error;
    }
  }

  async chat(systemPrompt, userPrompt, options = {}) {
    const { temperature = 0.3, maxTokens = 2000, responseFormat } = options;

    // Default to json_object (used by enrichment / strategist / etc.).
    // Free-text callers (OIED proposal/offer/analysis generators that emit
    // markdown) pass responseFormat: 'text' to opt out, since OpenAI rejects
    // json_object when the prompt itself doesn't mention 'json'.
    const fmt = responseFormat === 'text'
      ? undefined
      : { type: responseFormat || 'json_object' };

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(fmt ? { response_format: fmt } : {}),
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
