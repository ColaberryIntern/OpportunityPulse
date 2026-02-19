const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const DEVTO_API_URL = 'https://dev.to/api/articles';

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_TAGS = ['ai', 'machinelearning', 'artificialintelligence', 'llm'];
const DEFAULT_PER_PAGE = 30;

/**
 * DevToAdapter — fetches AI/ML-related articles from the Dev.to public API.
 * Queries multiple tags and deduplicates by article ID.
 * Uses native fetch (Node 18+).
 */
class DevToAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.tags = config.tags || DEFAULT_TAGS;
    this.perPage = config.perPage || DEFAULT_PER_PAGE;
  }

  /**
   * Fetch articles for a single tag from the Dev.to API.
   * @param {string} tag - The tag to query.
   * @returns {Promise<Array>} Array of raw article records.
   */
  async _fetchTag(tag) {
    const url = `${DEVTO_API_URL}?tag=${encodeURIComponent(tag)}&per_page=${this.perPage}`;

    logger.info(`DevTo fetch: tag="${tag}", per_page=${this.perPage}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          `DevTo API error for tag="${tag}": ${response.status} - ${errorBody}`
        );
        throw new Error(
          `DevTo API returned ${response.status}: ${errorBody}`
        );
      }

      const articles = await response.json();
      const results = Array.isArray(articles) ? articles : [];

      logger.info(
        `DevTo tag "${tag}": ${results.length} articles retrieved.`
      );

      return results;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(
          `DevTo fetch timed out for tag="${tag}".`
        );
        throw new Error(
          `DevTo API request timed out after ${REQUEST_TIMEOUT_MS}ms for tag="${tag}".`
        );
      }

      throw error;
    }
  }

  /**
   * Fetch AI/ML articles from Dev.to across multiple tags,
   * then deduplicate by article ID.
   * @returns {Promise<Array>} Array of unique raw article records.
   */
  async fetch() {
    let allArticles = [];

    for (const tag of this.tags) {
      try {
        const articles = await this._fetchTag(tag);
        allArticles = allArticles.concat(articles);
      } catch (error) {
        logger.error(`DevTo failed to fetch tag "${tag}": ${error.message}`);
        // Continue to next tag — do not let one failure block others
      }
    }

    // Deduplicate by article ID
    const seen = new Set();
    const uniqueArticles = [];
    for (const article of allArticles) {
      const articleId = String(article.id);
      if (!seen.has(articleId)) {
        seen.add(articleId);
        uniqueArticles.push(article);
      }
    }

    logger.info(
      `DevTo fetch complete: ${allArticles.length} total articles, ${uniqueArticles.length} unique after deduplication.`
    );

    return uniqueArticles;
  }

  /**
   * Transform raw Dev.to article records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw article objects from the Dev.to API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((article) => ({
      type: OPPORTUNITY_TYPES.AI_NEWS || 'ai_news',
      source: 'devto',
      sourceId: String(article.id),
      title: article.title,
      description: (article.description || '').substring(0, 2000),
      sourceUrl: article.url,
      status: 'active',
      category: article.user?.name || 'Dev.to',
      tags: Array.isArray(article.tag_list) ? article.tag_list.slice(0, 10) : [],
      value: article.positive_reactions_count || null,
      publishedAt: article.published_at ? new Date(article.published_at) : null,
      expiresAt: null,
      sourceData: article,
    }));
  }
}

module.exports = DevToAdapter;
