const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');
const Parser = require('rss-parser');

const DEFAULT_FEEDS = [
  'https://techcrunch.com/category/fundraise/feed/',
  'https://venturebeat.com/category/ai/feed/',
];

const DEFAULT_KEYWORDS = [
  'AI', 'artificial intelligence', 'raised', 'funding',
  'series', 'venture', 'startup', 'million', 'billion',
];

/**
 * Strip HTML tags from a string and collapse whitespace.
 * @param {string} html - Raw HTML string.
 * @returns {string} Plain text with tags removed.
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a funding amount from text.
 * Handles patterns like:
 *   "$50M" or "$50m"         -> 50000000
 *   "$50 million"            -> 50000000
 *   "$1.5B" or "$1.5 billion"-> 1500000000
 *   "$50,000,000"            -> 50000000
 *   "raised $50M"            -> 50000000
 *
 * @param {string} text - Text to search for funding amounts.
 * @returns {number|null} The extracted funding amount in dollars, or null.
 */
function extractFundingAmount(text) {
  if (!text || typeof text !== 'string') return null;

  // Pattern 1: $NNN.NNM or $NNN.NNB (shorthand suffix)
  const shorthandMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([mMbB])\b/);
  if (shorthandMatch) {
    const num = parseFloat(shorthandMatch[1].replace(/,/g, ''));
    const suffix = shorthandMatch[2].toLowerCase();
    if (suffix === 'm') return num * 1_000_000;
    if (suffix === 'b') return num * 1_000_000_000;
  }

  // Pattern 2: $NNN.NN million or $NNN.NN billion (word suffix)
  const wordMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion)/i);
  if (wordMatch) {
    const num = parseFloat(wordMatch[1].replace(/,/g, ''));
    const suffix = wordMatch[2].toLowerCase();
    if (suffix === 'million') return num * 1_000_000;
    if (suffix === 'billion') return num * 1_000_000_000;
  }

  // Pattern 3: $NNN,NNN,NNN (full numeric with commas, at least thousands)
  const fullNumMatch = text.match(/\$\s*([\d,]{5,})/);
  if (fullNumMatch) {
    const num = parseFloat(fullNumMatch[1].replace(/,/g, ''));
    if (!isNaN(num) && num > 0) return num;
  }

  return null;
}

/**
 * FundingNewsAdapter — aggregates funding/investment news from RSS feeds.
 * Filters items by keyword relevance and extracts funding amounts.
 * Uses the rss-parser npm package.
 */
class FundingNewsAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.feeds = config.feeds || DEFAULT_FEEDS;
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
  }

  /**
   * Check if a text string contains at least one keyword (case-insensitive).
   * @param {string} text - Text to search.
   * @returns {string[]} Array of matched keywords.
   */
  _matchKeywords(text) {
    if (!text) return [];
    const lowerText = text.toLowerCase();
    return this.keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
  }

  /**
   * Fetch and filter RSS feed items from all configured feeds.
   * Each feed is fetched independently; a single feed failure does not
   * block processing of other feeds.
   * @returns {Promise<Array>} Array of raw RSS items augmented with feedUrl and matchedKeywords.
   */
  async fetch() {
    const parser = new Parser();
    let allItems = [];

    for (const feedUrl of this.feeds) {
      try {
        logger.info(`FundingNews fetch: parsing feed "${feedUrl}"`);
        const feed = await parser.parseURL(feedUrl);
        const items = feed.items || [];

        logger.info(`FundingNews feed "${feedUrl}": ${items.length} items retrieved.`);

        for (const item of items) {
          const searchText = [item.title, item.contentSnippet, item.content]
            .filter(Boolean)
            .join(' ');
          const matched = this._matchKeywords(searchText);

          if (matched.length > 0) {
            allItems.push({
              ...item,
              _feedUrl: feedUrl,
              _matchedKeywords: matched,
            });
          }
        }
      } catch (error) {
        logger.error(`FundingNews failed to parse feed "${feedUrl}": ${error.message}`);
        // Continue to next feed — do not let one failure block others
      }
    }

    logger.info(
      `FundingNews fetch complete: ${allItems.length} keyword-matched items across ${this.feeds.length} feeds.`
    );

    return allItems;
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

      // Build a combined text for funding amount extraction
      const combinedText = [record.title, cleanDescription].filter(Boolean).join(' ');
      const fundingAmount = extractFundingAmount(combinedText);

      // Derive a stable sourceId from guid or link
      let sourceId = record.guid || record.link || '';
      if (sourceId) {
        // Use the last meaningful path segment or the full URL as-is
        try {
          const url = new URL(sourceId);
          const segments = url.pathname.split('/').filter(Boolean);
          sourceId = segments.length > 0 ? segments[segments.length - 1] : sourceId;
        } catch {
          // If not a valid URL, use as-is
        }
      }

      return {
        type: OPPORTUNITY_TYPES.INVESTMENT,
        source: 'funding_news',
        sourceId: String(sourceId),
        title: record.title || 'Untitled',
        description: cleanDescription,
        sourceUrl: record.link || null,
        status: 'active',
        category: record.creator || 'Unknown',
        tags: record._matchedKeywords || [],
        location: null,
        value: fundingAmount,
        publishedAt: record.isoDate || record.pubDate
          ? new Date(record.isoDate || record.pubDate)
          : null,
        expiresAt: null,
        sourceData: record,
      };
    });
  }
}

module.exports = FundingNewsAdapter;
