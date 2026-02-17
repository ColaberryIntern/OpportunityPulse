const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const USA_SPENDING_API_URL =
  'https://api.usaspending.gov/api/v2/search/spending_by_award/';

const DEFAULT_KEYWORDS = [
  'artificial intelligence',
  'machine learning',
  'AI/ML',
  'data science',
  'natural language processing',
];

const REQUEST_TIMEOUT_MS = 15000;
const MAX_PAGES = 3;
const RESULTS_PER_PAGE = 100;

/**
 * USASpending.gov adapter — fetches real government AI/ML contract data
 * from the USASpending.gov free public API (no auth required).
 * Uses native fetch (Node 18+).
 */
class UsaSpendingAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
    this.maxPages = config.maxPages || MAX_PAGES;
    this.resultsPerPage = config.resultsPerPage || RESULTS_PER_PAGE;
  }

  /**
   * Build the request body for the USASpending.gov award search API.
   * @param {number} page - The page number to fetch (1-based).
   * @returns {object} Request body object.
   */
  _buildRequestBody(page) {
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const formatDate = (d) => d.toISOString().split('T')[0]; // YYYY-MM-DD

    return {
      filters: {
        keywords: this.keywords,
        time_period: [
          {
            start_date: formatDate(oneYearAgo),
            end_date: formatDate(today),
          },
        ],
        award_type_codes: ['A', 'B', 'C', 'D'],
      },
      fields: [
        'Award ID',
        'Recipient Name',
        'Description',
        'Award Amount',
        'Start Date',
        'End Date',
        'Awarding Agency',
        'Awarding Sub Agency',
        'Place of Performance State Code',
        'generated_internal_id',
      ],
      limit: this.resultsPerPage,
      page,
      sort: 'Award Amount',
      order: 'desc',
    };
  }

  /**
   * Fetch all pages of AI/ML contract awards from USASpending.gov.
   * Paginates up to maxPages to avoid excessive requests.
   * @returns {Promise<Array>} Array of raw award records.
   */
  async fetch() {
    let allRecords = [];

    for (let page = 1; page <= this.maxPages; page++) {
      const body = this._buildRequestBody(page);

      logger.info(
        `USASpending fetch: page ${page}/${this.maxPages}, limit=${this.resultsPerPage}`
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(USA_SPENDING_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          logger.error(
            `USASpending API error: ${response.status} - ${errorBody}`
          );
          throw new Error(
            `USASpending API returned ${response.status}: ${errorBody}`
          );
        }

        const data = await response.json();
        const records = data.results || [];

        allRecords = allRecords.concat(records);

        logger.info(
          `USASpending page ${page}: ${records.length} records retrieved.`
        );

        // Stop early if this page had fewer results than the limit (last page)
        const hasNext = data.page_metadata
          ? data.page_metadata.hasNext
          : records.length >= this.resultsPerPage;

        if (!hasNext) {
          break;
        }
      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          logger.error(`USASpending fetch timed out on page ${page}.`);
          throw new Error(
            `USASpending API request timed out after ${REQUEST_TIMEOUT_MS}ms on page ${page}.`
          );
        }

        throw error;
      }
    }

    logger.info(
      `USASpending fetch complete: ${allRecords.length} total records retrieved.`
    );
    return allRecords;
  }

  /**
   * Transform raw USASpending.gov award records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw award objects from the API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const endDate = record['End Date'] ? new Date(record['End Date']) : null;
      const status = endDate && endDate > new Date() ? 'active' : 'closed';

      const tags = [
        record['Awarding Agency']
          ? `agency:${record['Awarding Agency']}`
          : null,
        record['Awarding Sub Agency']
          ? `sub-agency:${record['Awarding Sub Agency']}`
          : null,
        record['Place of Performance State Code']
          ? `state:${record['Place of Performance State Code']}`
          : null,
      ].filter(Boolean);

      return {
        type: OPPORTUNITY_TYPES.GOV_CONTRACT,
        source: 'usa_spending',
        sourceId:
          record['Award ID'] || record.generated_internal_id,
        title: `${record['Awarding Sub Agency'] || record['Awarding Agency']} — ${record['Award ID']}`,
        description: record['Description'],
        sourceUrl: `https://www.usaspending.gov/award/${record.generated_internal_id}`,
        status,
        category: 'AI/ML Government Contract',
        tags,
        location: record['Place of Performance State Code'] || null,
        value: record['Award Amount'] || null,
        publishedAt: record['Start Date']
          ? new Date(record['Start Date'])
          : null,
        expiresAt: endDate,
        sourceData: record,
      };
    });
  }
}

module.exports = UsaSpendingAdapter;
