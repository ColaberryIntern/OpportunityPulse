const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const REDDIT_BASE_URL = 'https://www.reddit.com/r';

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_SUBREDDITS = ['artificial', 'MachineLearning'];
const DEFAULT_TIME_FILTER = 'week';
const DEFAULT_LIMIT = 30;
const DEFAULT_MIN_SCORE = 10;

/**
 * RedditAIAdapter — fetches top AI/ML posts from Reddit subreddits
 * using the public JSON API (no auth required).
 * Includes a 1-second delay between subreddit requests to avoid rate limiting.
 * Uses native fetch (Node 18+).
 */
class RedditAIAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.subreddits = config.subreddits || DEFAULT_SUBREDDITS;
    this.timeFilter = config.timeFilter || DEFAULT_TIME_FILTER;
    this.limit = config.limit || DEFAULT_LIMIT;
    this.minScore = config.minScore || DEFAULT_MIN_SCORE;
  }

  /**
   * Fetch top posts for a single subreddit from the Reddit JSON API.
   * @param {string} subreddit - The subreddit name to query.
   * @returns {Promise<Array>} Array of raw post records.
   */
  async _fetchSubreddit(subreddit) {
    const url = `${REDDIT_BASE_URL}/${encodeURIComponent(subreddit)}/top.json?t=${this.timeFilter}&limit=${this.limit}`;

    logger.info(`Reddit fetch: subreddit="r/${subreddit}", time=${this.timeFilter}, limit=${this.limit}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OpportunityPulse/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          `Reddit API error for r/${subreddit}: ${response.status} - ${errorBody}`
        );
        throw new Error(
          `Reddit API returned ${response.status}: ${errorBody}`
        );
      }

      const data = await response.json();
      const posts = (data.data?.children || []).map((c) => c.data);

      logger.info(
        `Reddit r/${subreddit}: ${posts.length} posts retrieved.`
      );

      return posts;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(
          `Reddit fetch timed out for r/${subreddit}.`
        );
        throw new Error(
          `Reddit API request timed out after ${REQUEST_TIMEOUT_MS}ms for r/${subreddit}.`
        );
      }

      throw error;
    }
  }

  /**
   * Fetch top AI/ML posts from Reddit across multiple subreddits,
   * filter by minimum score, and deduplicate by post ID.
   * Includes a 1-second delay between subreddit requests to avoid rate limiting.
   * @returns {Promise<Array>} Array of unique raw post records.
   */
  async fetch() {
    let allPosts = [];

    for (let i = 0; i < this.subreddits.length; i++) {
      const subreddit = this.subreddits[i];

      // Add a 1-second delay between subreddit requests to avoid rate limiting
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      try {
        const posts = await this._fetchSubreddit(subreddit);
        allPosts = allPosts.concat(posts);
      } catch (error) {
        logger.error(`Reddit failed to fetch r/${subreddit}: ${error.message}`);
        // Continue to next subreddit — do not let one failure block others
      }
    }

    // Filter by minimum score
    const scoredPosts = allPosts.filter(
      (post) => (post.score || 0) >= this.minScore
    );

    // Deduplicate by post ID
    const seen = new Set();
    const uniquePosts = [];
    for (const post of scoredPosts) {
      const postId = String(post.id);
      if (!seen.has(postId)) {
        seen.add(postId);
        uniquePosts.push(post);
      }
    }

    logger.info(
      `Reddit fetch complete: ${allPosts.length} total posts, ${scoredPosts.length} above minScore=${this.minScore}, ${uniquePosts.length} unique after deduplication.`
    );

    return uniquePosts;
  }

  /**
   * Transform raw Reddit post records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw post objects from the Reddit JSON API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((post) => ({
      type: OPPORTUNITY_TYPES.AI_NEWS || 'ai_news',
      source: 'reddit',
      sourceId: String(post.id),
      title: post.title,
      description: (
        post.selftext ||
        `${post.score} upvotes, ${post.num_comments} comments on r/${post.subreddit}`
      ).substring(0, 2000),
      sourceUrl:
        post.url && !post.url.includes('reddit.com')
          ? post.url
          : `https://reddit.com${post.permalink}`,
      status: 'active',
      category: `r/${post.subreddit}`,
      tags: ['reddit', post.subreddit].filter(Boolean),
      value: post.score || null,
      publishedAt: post.created_utc ? new Date(post.created_utc * 1000) : null,
      expiresAt: null,
      sourceData: post,
    }));
  }
}

module.exports = RedditAIAdapter;
