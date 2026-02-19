const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');
const Parser = require('rss-parser');

const GOOGLE_NEWS_RSS_BASE =
  'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=';

const DEFAULT_QUERIES = [
  'artificial intelligence',
  'machine learning',
  'generative AI',
];

const DEFAULT_MAX_ITEMS = 100;

/**
 * Strip HTML tags and decode common HTML entities, then collapse whitespace.
 * @param {string} html - Raw HTML string.
 * @returns {string} Plain text.
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * GoogleNewsAdapter — aggregates AI-related news from Google News RSS feeds.
 * Fetches one feed per configured query, deduplicates by link, and filters
 * for AI-relevant items.
 * Uses the rss-parser npm package.
 */
class GoogleNewsAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.queries = config.queries || DEFAULT_QUERIES;
    this.maxItems = config.maxItems || DEFAULT_MAX_ITEMS;
  }

  /**
   * Check if a text string contains at least one query keyword (case-insensitive).
   * @param {string} text - Text to search.
   * @param {string} query - The query string (may contain multiple words).
   * @returns {boolean}
   */
  _isRelevant(text, query) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return lowerText.includes(query.toLowerCase());
  }

  /**
   * Return the matched keyword strings for a given item across all queries.
   * @param {string} text - Combined text to search.
   * @returns {string[]} Array of matched query strings.
   */
  _matchQueries(text) {
    if (!text) return [];
    const lowerText = text.toLowerCase();
    return this.queries.filter((q) => lowerText.includes(q.toLowerCase()));
  }

  /**
   * Fetch and filter RSS feed items from Google News for all configured queries.
   * Each query is fetched independently; a single feed failure does not
   * block processing of other queries.
   * @returns {Promise<Array>} Array of raw RSS items augmented with _matchedQueries.
   */
  async fetch() {
    const parser = new Parser();
    const allItems = [];
    const seen = new Set();

    for (const query of this.queries) {
      const encodedQuery = encodeURIComponent(query);
      const feedUrl = `${GOOGLE_NEWS_RSS_BASE}${encodedQuery}`;

      try {
        logger.info(`GoogleNews fetch: parsing feed for query "${query}"`);
        const feed = await parser.parseURL(feedUrl);
        const items = feed.items || [];

        logger.info(
          `GoogleNews feed for "${query}": ${items.length} items retrieved.`
        );

        for (const item of items) {
          // Deduplicate by link
          const dedupeKey = item.link || item.guid || '';
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          // Filter for AI-relevance based on title and content
          const searchText = [item.title, item.contentSnippet, item.content]
            .filter(Boolean)
            .join(' ');

          if (this._isRelevant(searchText, query)) {
            const matchedTags = this._matchQueries(searchText);
            allItems.push({
              ...item,
              _matchedQueries: matchedTags,
            });
          }
        }
      } catch (error) {
        logger.error(
          `GoogleNews failed to parse feed for query "${query}": ${error.message}`
        );
        // Continue to next query — do not let one failure block others
      }

      // Respect maxItems cap
      if (allItems.length >= this.maxItems) break;
    }

    const capped = allItems.slice(0, this.maxItems);

    logger.info(
      `GoogleNews fetch complete: ${capped.length} unique AI-relevant items across ${this.queries.length} queries.`
    );

    return capped;
  }

  /**
   * Transform raw RSS items into the Opportunity model shape.
   * @param {Array} rawRecords - RSS items augmented by fetch().
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const rawDescription = record.contentSnippet || record.content || '';
      const cleanDescription = stripHtml(rawDescription).substring(0, 2000);

      // Derive a stable sourceId from guid or link
      let sourceId = record.guid || record.link || '';
      if (sourceId) {
        try {
          const url = new URL(sourceId);
          const segments = url.pathname.split('/').filter(Boolean);
          sourceId =
            segments.length > 0 ? segments[segments.length - 1] : sourceId;
        } catch {
          // If not a valid URL, use as-is
        }
      }

      return {
        type: OPPORTUNITY_TYPES.AI_NEWS || 'ai_news',
        source: 'google_news',
        sourceId: String(sourceId),
        title: stripHtml(record.title) || 'Untitled',
        description: cleanDescription,
        sourceUrl: record.link || null,
        status: 'active',
        category: record.creator || 'Google News',
        tags: record._matchedQueries || [],
        value: null,
        publishedAt:
          record.isoDate || record.pubDate
            ? new Date(record.isoDate || record.pubDate)
            : null,
        expiresAt: null,
        sourceData: record,
      };
    });
  }
}

module.exports = GoogleNewsAdapter;
