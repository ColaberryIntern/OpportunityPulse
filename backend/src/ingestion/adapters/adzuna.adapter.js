const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const ADZUNA_API_BASE = 'https://api.adzuna.com/v1/api/jobs/us/search/1';

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_WHAT = 'artificial intelligence';
const DEFAULT_RESULTS_PER_PAGE = 50;

/**
 * AdzunaAdapter — fetches AI/ML job postings from the Adzuna Jobs API.
 * Requires ADZUNA_APP_ID and ADZUNA_APP_KEY environment variables.
 * Uses native fetch (Node 18+) with AbortController timeout.
 */
class AdzunaAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.what = config.what || DEFAULT_WHAT;
    this.resultsPerPage = config.resultsPerPage || DEFAULT_RESULTS_PER_PAGE;

    this.appId = process.env.ADZUNA_APP_ID;
    this.appKey = process.env.ADZUNA_APP_KEY;

    if (!this.appId || !this.appKey) {
      throw new Error(
        'Adzuna adapter requires ADZUNA_APP_ID and ADZUNA_APP_KEY environment variables to be set. ' +
        'Register at https://developer.adzuna.com/ to obtain API credentials.'
      );
    }
  }

  /**
   * Fetch job postings from the Adzuna API.
   * @returns {Promise<Array>} Array of raw job records from data.results.
   */
  async fetch() {
    const params = new URLSearchParams({
      app_id: this.appId,
      app_key: this.appKey,
      what: this.what,
      results_per_page: String(this.resultsPerPage),
      'content-type': 'application/json',
    });

    const url = `${ADZUNA_API_BASE}?${params.toString()}`;

    logger.info(`Adzuna fetch: what="${this.what}", resultsPerPage=${this.resultsPerPage}`);

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
        logger.error(`Adzuna API error: ${response.status} - ${errorBody}`);
        throw new Error(`Adzuna API returned ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const results = data.results || [];

      logger.info(`Adzuna fetch complete: ${results.length} records retrieved.`);

      return results;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(`Adzuna fetch timed out after ${REQUEST_TIMEOUT_MS}ms.`);
        throw new Error(`Adzuna API request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      }

      throw error;
    }
  }

  /**
   * Transform raw Adzuna job records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw job objects from the Adzuna API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => ({
      type: OPPORTUNITY_TYPES.AI_JOB,
      source: 'adzuna',
      sourceId: String(record.id),
      title: record.title + (record.company?.display_name ? ` — ${record.company.display_name}` : ''),
      description: record.description ? record.description.substring(0, 2000) : '',
      sourceUrl: record.redirect_url,
      status: 'active',
      category: record.category?.label || null,
      tags: [record.category?.tag, record.contract_type].filter(Boolean),
      location: record.location?.display_name || null,
      value: record.salary_max || record.salary_min || null,
      publishedAt: record.created ? new Date(record.created) : null,
      expiresAt: null,
      sourceData: record,
    }));
  }
}

module.exports = AdzunaAdapter;
