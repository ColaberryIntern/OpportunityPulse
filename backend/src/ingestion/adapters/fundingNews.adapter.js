const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');
const Parser = require('rss-parser');
const { extractFundingAmount } = require('../../utils/monetaryParser');
const { scoreInvestment } = require('../../utils/investmentScore');

// v9.8.2: TechCrunch's `/category/fundraise/feed/` started returning 404
// in early 2026 — that was the only fresh source on the list, so the
// capital channel went stale (last new row 2026-02-18). Swap to the
// venture/startups feed and add Crunchbase News as a second source so
// we're not single-sourced again. VentureBeat AI feed kept for AI-funding
// mentions (low-volume but topical).
//
// v9.11: these defaults are now MERGED with any DB-configured feeds rather
// than being a fallback that a stale DB config can fully shadow. The v9.8.2
// fix above sat inert for a month because the seeded data_sources row pinned
// config.feeds to the dead /fundraise/ URL and `config.feeds || DEFAULT_FEEDS`
// meant the code default was never consulted. Merging makes the known-good
// feeds authoritative even if the DB row is stale.
const DEFAULT_FEEDS = [
  'https://techcrunch.com/category/venture/feed/',
  'https://news.crunchbase.com/feed/',
  'https://venturebeat.com/category/ai/feed/',
];

// Feeds known to be dead/redirecting — pruned from the effective list even if
// a stale DB config still references them, so we don't waste a request + log a
// 404 every run. Add to this list when a feed dies; remove when it recovers.
const DEAD_FEEDS = new Set([
  'https://techcrunch.com/category/fundraise/feed/',
]);

/**
 * Merge DB-configured feeds with the code defaults, drop known-dead feeds,
 * and de-duplicate. The code defaults are authoritative (always included) so
 * a stale DB row can ADD feeds but can't REMOVE the known-good ones.
 * @param {string[]|undefined} configFeeds - feeds from dataSource.config.
 * @returns {string[]} Effective, de-duplicated, live feed list.
 */
function resolveFeeds(configFeeds) {
  const merged = [...DEFAULT_FEEDS, ...(Array.isArray(configFeeds) ? configFeeds : [])];
  const seen = new Set();
  const out = [];
  for (const f of merged) {
    if (!f || DEAD_FEEDS.has(f) || seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out;
}

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
 * FundingNewsAdapter — aggregates funding/investment news from RSS feeds.
 * Filters items by keyword relevance and extracts funding amounts.
 * Uses the rss-parser npm package.
 */
class FundingNewsAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.feeds = resolveFeeds(config.feeds);
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

      const publishedAt = record.isoDate || record.pubDate
        ? new Date(record.isoDate || record.pubDate)
        : null;
      const tags = record._matchedKeywords || [];

      return {
        type: OPPORTUNITY_TYPES.INVESTMENT,
        source: 'funding_news',
        sourceId: String(sourceId),
        title: record.title || 'Untitled',
        description: cleanDescription,
        sourceUrl: record.link || null,
        status: 'active',
        category: record.creator || 'Unknown',
        tags,
        location: null,
        value: fundingAmount,
        publishedAt,
        // Deterministic relevance score so fresh raises can rank in the digest
        // instead of sorting below seeded rows under `aiScore DESC NULLS LAST`.
        aiScore: scoreInvestment({
          value: fundingAmount,
          publishedAt,
          title: record.title,
          description: cleanDescription,
          tags,
        }),
        expiresAt: null,
        sourceData: record,
      };
    });
  }
}

module.exports = FundingNewsAdapter;
