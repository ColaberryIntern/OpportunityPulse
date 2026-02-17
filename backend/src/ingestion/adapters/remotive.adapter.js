const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const REMOTIVE_API_BASE = 'https://remotive.com/api/remote-jobs';

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_SEARCHES = ['artificial intelligence', 'machine learning'];
const DEFAULT_LIMIT = 50;

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
 * Parse a salary string and extract the highest numeric value.
 * Handles formats like "$165k - $300k", "$150,000", "$200K/yr", etc.
 * @param {string} salaryStr - Raw salary string from the API.
 * @returns {number|null} The highest salary value as a number, or null if unparseable.
 */
function parseSalary(salaryStr) {
  if (!salaryStr || typeof salaryStr !== 'string') return null;

  // Find all numbers, optionally followed by 'k' (case-insensitive)
  const matches = salaryStr.match(/[\d,]+\.?\d*\s*[kK]?/g);
  if (!matches || matches.length === 0) return null;

  const values = matches.map((match) => {
    // Remove commas and whitespace
    const cleaned = match.replace(/[,\s]/g, '');
    const hasK = /[kK]/.test(cleaned);
    const numStr = cleaned.replace(/[kK]/g, '');
    const num = parseFloat(numStr);

    if (isNaN(num)) return 0;
    return hasK ? num * 1000 : num;
  });

  const maxValue = Math.max(...values);
  return maxValue > 0 ? maxValue : null;
}

/**
 * Remotive adapter — fetches real AI/ML remote job postings
 * from the Remotive free public API (no auth required).
 * Uses native fetch (Node 18+).
 */
class RemotiveAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.searches = config.searches || DEFAULT_SEARCHES;
    this.limit = config.limit || DEFAULT_LIMIT;
  }

  /**
   * Fetch a single search query from the Remotive API.
   * @param {string} searchTerm - The search term to query.
   * @returns {Promise<Array>} Array of raw job records.
   */
  async _fetchSearch(searchTerm) {
    const encodedSearch = encodeURIComponent(searchTerm).replace(/%20/g, '+');
    const url = `${REMOTIVE_API_BASE}?category=software-dev&search=${encodedSearch}&limit=${this.limit}`;

    logger.info(`Remotive fetch: search="${searchTerm}", limit=${this.limit}`);

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
          `Remotive API error for "${searchTerm}": ${response.status} - ${errorBody}`
        );
        throw new Error(
          `Remotive API returned ${response.status}: ${errorBody}`
        );
      }

      const data = await response.json();
      const jobs = data.jobs || [];

      logger.info(
        `Remotive search "${searchTerm}": ${jobs.length} records retrieved.`
      );

      return jobs;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(
          `Remotive fetch timed out for search="${searchTerm}".`
        );
        throw new Error(
          `Remotive API request timed out after ${REQUEST_TIMEOUT_MS}ms for search="${searchTerm}".`
        );
      }

      throw error;
    }
  }

  /**
   * Fetch AI/ML job postings from Remotive across multiple search terms,
   * then deduplicate by job ID.
   * @returns {Promise<Array>} Array of unique raw job records.
   */
  async fetch() {
    let allJobs = [];

    for (const searchTerm of this.searches) {
      const jobs = await this._fetchSearch(searchTerm);
      allJobs = allJobs.concat(jobs);
    }

    // Deduplicate by job ID
    const seen = new Set();
    const uniqueJobs = [];
    for (const job of allJobs) {
      const jobId = String(job.id);
      if (!seen.has(jobId)) {
        seen.add(jobId);
        uniqueJobs.push(job);
      }
    }

    logger.info(
      `Remotive fetch complete: ${allJobs.length} total records, ${uniqueJobs.length} unique after deduplication.`
    );

    return uniqueJobs;
  }

  /**
   * Transform raw Remotive job records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw job objects from the Remotive API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => ({
      type: OPPORTUNITY_TYPES.AI_JOB,
      source: 'remotive',
      sourceId: String(record.id),
      title: `${record.title} — ${record.company_name}`,
      description: stripHtml(record.description).substring(0, 2000),
      sourceUrl: record.url,
      status: 'active',
      category: record.category || 'AI/ML',
      tags: (record.tags || []).slice(0, 10),
      location: record.candidate_required_location || 'Remote',
      value: parseSalary(record.salary),
      publishedAt: record.publication_date
        ? new Date(record.publication_date)
        : null,
      expiresAt: null,
      sourceData: record,
    }));
  }
}

module.exports = RemotiveAdapter;
