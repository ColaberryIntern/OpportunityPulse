const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');
const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'OpportunityPulse/1.0' },
});

/**
 * Strip HTML tags from a string and collapse whitespace.
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Extract platform name from a feed URL hostname.
 */
function getPlatformFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. and TLD
    return hostname.replace(/^www\./, '').split('.')[0];
  } catch {
    return 'unknown';
  }
}

/**
 * Generic Freelance RSS adapter — processes a list of RSS feed URLs
 * for freelance project postings from various platforms.
 *
 * Catch-all for platforms like Toptal, Guru, PeoplePerHour, etc.
 * Configure feeds in dataSource.config.feeds array.
 */
class GenericFreelanceRssAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.feeds = config.feeds || [];
  }

  async fetch() {
    if (this.feeds.length === 0) {
      logger.info('Generic Freelance RSS: No feeds configured');
      return [];
    }

    const allItems = [];

    for (const feedUrl of this.feeds) {
      try {
        const feed = await parser.parseURL(feedUrl);
        const platform = getPlatformFromUrl(feedUrl);
        const items = (feed.items || []).map((item) => ({
          ...item,
          _platform: platform,
          _feedUrl: feedUrl,
        }));
        allItems.push(...items);
        logger.info(`Generic Freelance RSS "${platform}": ${items.length} items`);
      } catch (error) {
        logger.warn(`Generic Freelance RSS feed "${feedUrl}" failed: ${error.message}`);
      }
    }

    // Deduplicate by link or guid
    const seen = new Set();
    const unique = [];
    for (const item of allItems) {
      const id = item.guid || item.link || item.title;
      if (id && !seen.has(id)) {
        seen.add(id);
        unique.push(item);
      }
    }

    logger.info(`Generic Freelance RSS complete: ${allItems.length} total, ${unique.length} unique`);
    return unique;
  }

  transform(rawRecords) {
    return rawRecords.map((item) => {
      const platform = item._platform || 'unknown';
      const description = stripHtml(item.content || item.contentSnippet || '');
      const categories = (item.categories || []).filter(Boolean);

      return {
        type: OPPORTUNITY_TYPES.FREELANCE,
        source: platform,
        sourceId: item.guid || item.link || `${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: (item.title || 'Untitled Project').substring(0, 500),
        description: description.substring(0, 2000),
        sourceUrl: item.link || null,
        status: 'active',
        category: 'Freelance',
        tags: categories.slice(0, 10),
        location: 'Remote',
        value: null,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        expiresAt: null,
        sourceData: {
          platform,
          feedUrl: item._feedUrl,
          categories,
          author: item.creator || item.author || null,
        },
      };
    });
  }
}

module.exports = GenericFreelanceRssAdapter;
