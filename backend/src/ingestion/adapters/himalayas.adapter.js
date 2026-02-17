const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const HIMALAYAS_API_URL = 'https://himalayas.app/jobs/api';

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_PAGES = 3;

const DEFAULT_KEYWORDS = [
  'artificial intelligence', 'machine learning', 'AI',
  'data science', 'deep learning', 'NLP', 'computer vision',
  'LLM', 'GPT', 'neural network',
];

/**
 * Strip HTML tags from a string and collapse whitespace.
 * @param {string} html - Raw HTML string.
 * @returns {string} Plain text.
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Check if a job matches AI/ML keywords based on title, categories, and description.
 * @param {object} job - Raw job object from Himalayas.
 * @param {string[]} keywords - Keywords to match against.
 * @returns {boolean}
 */
function isAiRelated(job, keywords) {
  const searchText = [
    job.title || '',
    (job.categories || []).join(' '),
    (job.excerpt || job.description || '').substring(0, 500),
  ].join(' ').toLowerCase();

  return keywords.some((kw) => searchText.toLowerCase().includes(kw.toLowerCase()));
}

/**
 * Himalayas adapter — fetches real remote job postings from the Himalayas
 * free public API (no auth required). Filters for AI/ML-related positions.
 * Uses native fetch (Node 18+).
 */
class HimalayasAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
    this.maxPages = config.maxPages || DEFAULT_MAX_PAGES;
    this.limit = config.limit || DEFAULT_LIMIT;
  }

  /**
   * Fetch a single page from the Himalayas API.
   * @param {number} offset - The offset to start from.
   * @returns {Promise<object>} API response with jobs array and metadata.
   */
  async _fetchPage(offset) {
    const url = `${HIMALAYAS_API_URL}?limit=${this.limit}&offset=${offset}`;

    logger.info(`Himalayas fetch: offset=${offset}, limit=${this.limit}`);

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
        logger.error(`Himalayas API error: ${response.status} - ${errorBody}`);
        throw new Error(`Himalayas API returned ${response.status}: ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(`Himalayas fetch timed out at offset ${offset}.`);
        throw new Error(
          `Himalayas API request timed out after ${REQUEST_TIMEOUT_MS}ms at offset ${offset}.`
        );
      }

      throw error;
    }
  }

  /**
   * Fetch job listings from Himalayas, paginating up to maxPages,
   * then filter for AI/ML-related positions.
   * @returns {Promise<Array>} Array of AI/ML-related raw job records.
   */
  async fetch() {
    let allJobs = [];

    for (let page = 0; page < this.maxPages; page++) {
      const offset = page * this.limit;
      const data = await this._fetchPage(offset);
      const jobs = data.jobs || [];

      allJobs = allJobs.concat(jobs);

      logger.info(`Himalayas page ${page + 1}: ${jobs.length} records retrieved.`);

      // Stop if fewer results returned than limit (last page)
      if (jobs.length < this.limit) {
        break;
      }
    }

    // Filter for AI/ML-related jobs
    const aiJobs = allJobs.filter((job) => isAiRelated(job, this.keywords));

    logger.info(
      `Himalayas fetch complete: ${allJobs.length} total jobs, ${aiJobs.length} AI/ML-related.`
    );

    return aiJobs;
  }

  /**
   * Transform raw Himalayas job records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw job objects from the API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const tags = (record.categories || []).slice(0, 10);

      return {
        type: OPPORTUNITY_TYPES.AI_JOB,
        source: 'himalayas',
        sourceId: String(record.id),
        title: `${record.title || 'Untitled'} — ${record.companyName || 'Unknown'}`,
        description: stripHtml(record.excerpt || record.description || '').substring(0, 2000),
        sourceUrl: record.applicationUrl || record.url || `https://himalayas.app/jobs/${record.id}`,
        status: 'active',
        category: 'AI/ML',
        tags,
        location: (record.locationRestrictions || []).join(', ') || 'Remote',
        value: record.salaryCurrency && record.salaryMax
          ? record.salaryMax
          : null,
        publishedAt: record.publishedDate ? new Date(record.publishedDate) : null,
        expiresAt: null,
        sourceData: record,
      };
    });
  }
}

module.exports = HimalayasAdapter;
