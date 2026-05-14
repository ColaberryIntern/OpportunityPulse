// Research Intelligence Phase 2.5 — corporate research blog RSS adapter.
//
// One configurable adapter for the frontier-lab research blogs: OpenAI,
// DeepMind, Google AI, BAIR, Meta AI, NVIDIA, etc. Each is a standard RSS/
// Atom feed; the list lives in dataSource.config.feeds so adding a lab is a
// config change, not a code change.
//
// These are strategic-signal posts (what the labs choose to publicize), not
// raw papers — so they're tagged researchType='corporate_research' and
// classify mostly as PARTNER/IGNORE unless they hit a high-priority topic.
//
// Failure modes:
//   - one feed down → logged, skipped, others continue
//   - all feeds down → fetch returns [] (Source Health sees zero_yield)

const BaseAdapter = require('../base.adapter');
const logger = require('../../../logging/logger');
const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'OpportunityPulse/1.0 (research ingestion)' },
});

// Default feed set — overridable via dataSource.config.feeds. Each entry:
// { url, lab }. lab is used as the category + tag so the UI can group.
const DEFAULT_FEEDS = [
  { url: 'https://openai.com/blog/rss.xml', lab: 'OpenAI' },
  { url: 'https://deepmind.google/blog/rss.xml', lab: 'DeepMind' },
  { url: 'https://bair.berkeley.edu/blog/feed.xml', lab: 'BAIR' },
];

const MAX_ITEMS_PER_FEED = 25;

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

class ResearchBlogRssAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.feeds = Array.isArray(config.feeds) && config.feeds.length
      ? config.feeds
      : DEFAULT_FEEDS;
  }

  async _fetchFeed(feed) {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).slice(0, MAX_ITEMS_PER_FEED);
    logger.info(`Research blog RSS "${feed.lab}": ${items.length} items.`);
    return items.map((item) => ({ ...item, _lab: feed.lab, _feedUrl: feed.url }));
  }

  async fetch() {
    let all = [];
    for (const feed of this.feeds) {
      try {
        const items = await this._fetchFeed(feed);
        all = all.concat(items);
      } catch (error) {
        logger.error(`Research blog RSS failed for "${feed.lab}" (${feed.url}): ${error.message}`);
        // Continue — one lab's feed being down doesn't sink the run.
      }
    }
    // Dedupe by link (RSS guid is unreliable across these feeds).
    const seen = new Set();
    const unique = [];
    for (const item of all) {
      const key = item.link || item.guid;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    logger.info(`Research blog RSS fetch complete: ${all.length} total, ${unique.length} unique.`);
    return unique;
  }

  transform(rawRecords) {
    return rawRecords.map((item) => ({
      type: 'research',
      source: 'research_blogs',
      // Link is the stable identity for blog posts.
      sourceId: String(item.link || item.guid).slice(0, 255),
      title: (item.title || 'Untitled').slice(0, 500),
      description: stripHtml(item.contentSnippet || item.content || item.summary || '').slice(0, 2000),
      sourceUrl: item.link || null,
      status: 'active',
      category: item._lab || 'Corporate Research',
      tags: [item._lab].filter(Boolean),
      value: null,
      publishedAt: item.isoDate ? new Date(item.isoDate)
        : (item.pubDate ? new Date(item.pubDate) : null),
      expiresAt: null,
      sourceData: {
        authors: item.creator ? [item.creator] : [],
        institution: item._lab || null,
        citationCount: null,
        publishedDate: item.isoDate || item.pubDate || null,
        researchType: 'corporate_research',
        domains: [],
        lab: item._lab || null,
        feedUrl: item._feedUrl || null,
      },
    }));
  }
}

module.exports = ResearchBlogRssAdapter;
