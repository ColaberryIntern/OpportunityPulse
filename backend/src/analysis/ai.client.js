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
  // Accepts a single Buffer OR an array of { buffer, mime } images. Multi-image
  // is used for long portal pages that need multiple screenshots — gpt-4o-mini
  // can correlate rows across them in a single coherent JSON response.
  async chatVision(systemPrompt, userText, imageInput, options = {}) {
    const {
      temperature = 0,
      maxTokens = 2500,
      responseFormat = 'json_object',
      mime: defaultMime = 'image/png',
    } = options;
    // Normalize to an array of { buffer, mime }.
    let images;
    if (Buffer.isBuffer(imageInput)) {
      images = [{ buffer: imageInput, mime: defaultMime }];
    } else if (Array.isArray(imageInput) && imageInput.length > 0) {
      images = imageInput.map((it) => {
        if (Buffer.isBuffer(it)) return { buffer: it, mime: defaultMime };
        if (it && Buffer.isBuffer(it.buffer)) return { buffer: it.buffer, mime: it.mime || defaultMime };
        throw new Error('chatVision: every image must be a Buffer or { buffer, mime }');
      });
    } else {
      throw new Error('chatVision: imageInput must be a Buffer or non-empty array');
    }
    const totalBytes = images.reduce((acc, im) => acc + im.buffer.length, 0);
    const fmt = responseFormat === 'text' ? undefined : { type: responseFormat };
    const userContent = [{ type: 'text', text: userText }];
    for (const im of images) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${im.mime};base64,${im.buffer.toString('base64')}` },
      });
    }
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
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
        imageCount: images.length,
        totalImageBytes: totalBytes,
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
