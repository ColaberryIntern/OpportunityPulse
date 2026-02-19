const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const HN_ALGOLIA_API_URL = 'https://hn.algolia.com/api/v1/search';

const REQUEST_TIMEOUT_MS = 15000;

const DEFAULT_QUERIES = [
  'artificial intelligence',
  'machine learning',
  'LLM',
];

const DEFAULT_HITS_PER_PAGE = 50;
const DEFAULT_MIN_POINTS = 5;

/**
 * HackerNewsAdapter — fetches AI/ML-related stories from the Hacker News
 * Algolia search API. Deduplicates across multiple query terms and filters
 * by minimum point threshold.
 * Uses native fetch (Node 18+).
 */
class HackerNewsAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.queries = config.queries || DEFAULT_QUERIES;
    this.hitsPerPage = config.hitsPerPage || DEFAULT_HITS_PER_PAGE;
    this.minPoints = config.minPoints != null ? config.minPoints : DEFAULT_MIN_POINTS;
  }

  /**
   * Return the matched keyword strings for a given hit across all queries.
   * @param {object} hit - A hit object from the Algolia API.
   * @returns {string[]} Array of matched query strings.
   */
  _matchQueries(hit) {
    const searchText = [hit.title, hit.story_text, hit.url]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return this.queries.filter((q) => searchText.includes(q.toLowerCase()));
  }

  /**
   * Fetch stories for a single search query from the HN Algolia API.
   * @param {string} query - The search query.
   * @returns {Promise<Array>} Array of raw hit objects.
   */
  async _fetchQuery(query) {
    const params = new URLSearchParams({
      query,
      tags: 'story',
      hitsPerPage: String(this.hitsPerPage),
    });

    const url = `${HN_ALGOLIA_API_URL}?${params.toString()}`;

    logger.info(
      `HackerNews fetch: query="${query}", hitsPerPage=${this.hitsPerPage}`
    );

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
          `HackerNews API error for "${query}": ${response.status} - ${errorBody}`
        );
        throw new Error(
          `HackerNews API returned ${response.status}: ${errorBody}`
        );
      }

      const data = await response.json();
      const hits = data.hits || [];

      logger.info(
        `HackerNews search "${query}": ${hits.length} hits retrieved.`
      );

      return hits;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(
          `HackerNews fetch timed out for query="${query}".`
        );
        throw new Error(
          `HackerNews API request timed out after ${REQUEST_TIMEOUT_MS}ms for query="${query}".`
        );
      }

      throw error;
    }
  }

  /**
   * Fetch AI/ML stories from HN Algolia across multiple queries,
   * deduplicate by objectID, and filter by minimum points.
   * @returns {Promise<Array>} Array of unique raw hit objects.
   */
  async fetch() {
    let allHits = [];

    for (const query of this.queries) {
      const hits = await this._fetchQuery(query);
      allHits = allHits.concat(hits);
    }

    // Deduplicate by objectID
    const seen = new Set();
    const uniqueHits = [];
    for (const hit of allHits) {
      const hitId = String(hit.objectID);
      if (!seen.has(hitId)) {
        seen.add(hitId);
        uniqueHits.push(hit);
      }
    }

    // Filter by minimum points
    const filtered = uniqueHits.filter(
      (hit) => (hit.points || 0) >= this.minPoints
    );

    logger.info(
      `HackerNews fetch complete: ${allHits.length} total hits, ${uniqueHits.length} unique, ${filtered.length} after minPoints filter (>=${this.minPoints}).`
    );

    return filtered;
  }

  /**
   * Transform raw HN Algolia hits into the Opportunity model shape.
   * @param {Array} rawRecords - Raw hit objects from the Algolia API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((hit) => ({
      type: OPPORTUNITY_TYPES.AI_NEWS || 'ai_news',
      source: 'hacker_news',
      sourceId: String(hit.objectID),
      title: hit.title || 'Untitled',
      description: `${hit.points || 0} points, ${hit.num_comments || 0} comments on Hacker News`,
      sourceUrl:
        hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      status: 'active',
      category: 'Hacker News',
      tags: this._matchQueries(hit),
      value: hit.points || null,
      publishedAt: hit.created_at ? new Date(hit.created_at) : null,
      expiresAt: null,
      sourceData: hit,
    }));
  }
}

module.exports = HackerNewsAdapter;
