const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');
const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'OpportunityPulse/1.0' },
});

const DEFAULT_SEARCHES = ['artificial intelligence', 'machine learning', 'llm', 'chatbot'];

/**
 * Strip HTML tags from a string and collapse whitespace.
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse budget from Upwork RSS description text.
 * Handles: "Budget: $500-$1,000", "Fixed-Price: $5,000", "Hourly: $25-$50/hr"
 */
function parseBudget(text) {
  if (!text) return null;

  // Fixed price: "$X,XXX" or "$X-$Y"
  const fixedMatch = text.match(/(?:Budget|Fixed[- ]Price)\s*:\s*\$?([\d,]+)(?:\s*-\s*\$?([\d,]+))?/i);
  if (fixedMatch) {
    const high = fixedMatch[2] || fixedMatch[1];
    return parseFloat(high.replace(/,/g, '')) || null;
  }

  // Hourly: "$X-$Y/hr" → estimate monthly (160 hours)
  const hourlyMatch = text.match(/Hourly\s*:\s*\$?([\d.]+)\s*-\s*\$?([\d.]+)/i);
  if (hourlyMatch) {
    const highRate = parseFloat(hourlyMatch[2]);
    return highRate > 0 ? Math.round(highRate * 160) : null;
  }

  return null;
}

/**
 * Extract skills from Upwork RSS item.
 * Upwork RSS typically lists skills in the description or categories.
 */
function extractSkills(item) {
  const skills = [];

  // From categories
  if (item.categories) {
    skills.push(...item.categories);
  }

  // From description — look for "Skills:" section
  const desc = item.contentSnippet || item.content || '';
  const skillsMatch = desc.match(/Skills?\s*:\s*([^\n]+)/i);
  if (skillsMatch) {
    skills.push(...skillsMatch[1].split(',').map((s) => s.trim()).filter(Boolean));
  }

  return [...new Set(skills)].slice(0, 15);
}

/**
 * Generate a stable sourceId from an RSS item.
 */
function getSourceId(item) {
  if (item.guid) return String(item.guid);
  if (item.link) return String(item.link);
  return `upwork-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Upwork RSS adapter — fetches AI freelance project postings
 * from Upwork RSS feeds.
 */
class UpworkRssAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.searches = config.searches || DEFAULT_SEARCHES;
    this.feedUrl = config.feedUrl || null;
  }

  async fetch() {
    const allItems = [];

    if (this.feedUrl) {
      try {
        const feed = await parser.parseURL(this.feedUrl);
        allItems.push(...(feed.items || []));
        logger.info(`Upwork RSS: ${feed.items?.length || 0} items from custom feed URL`);
      } catch (error) {
        logger.error(`Upwork RSS feed error: ${error.message}`);
      }
    }

    // Search-based RSS feeds
    for (const search of this.searches) {
      try {
        const encodedSearch = encodeURIComponent(search);
        const url = `https://www.upwork.com/ab/feed/jobs/rss?q=${encodedSearch}&sort=recency`;
        const feed = await parser.parseURL(url);
        allItems.push(...(feed.items || []));
        logger.info(`Upwork RSS search "${search}": ${feed.items?.length || 0} items`);
      } catch (error) {
        logger.warn(`Upwork RSS search "${search}" failed: ${error.message}`);
      }
    }

    // Deduplicate by sourceId
    const seen = new Set();
    const unique = [];
    for (const item of allItems) {
      const id = getSourceId(item);
      if (!seen.has(id)) {
        seen.add(id);
        unique.push(item);
      }
    }

    logger.info(`Upwork RSS fetch complete: ${allItems.length} total, ${unique.length} unique`);
    return unique;
  }

  transform(rawRecords) {
    return rawRecords.map((item) => {
      const description = stripHtml(item.content || item.contentSnippet || '');
      const budget = parseBudget(description);
      const skills = extractSkills(item);

      return {
        type: OPPORTUNITY_TYPES.FREELANCE,
        source: 'upwork',
        sourceId: getSourceId(item),
        title: (item.title || 'Untitled Project').substring(0, 500),
        description: description.substring(0, 2000),
        sourceUrl: item.link || null,
        status: 'active',
        category: 'Freelance',
        tags: skills.slice(0, 10),
        location: 'Remote',
        value: budget,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        expiresAt: null,
        sourceData: {
          platform: 'upwork',
          budget,
          skills,
          rawTitle: item.title,
          categories: item.categories || [],
        },
      };
    });
  }
}

module.exports = UpworkRssAdapter;
