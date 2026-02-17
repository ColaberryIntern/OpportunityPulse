const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

const SAM_GOV_BASE_URL = 'https://api.sam.gov/prod/opportunities/v2/search';

/**
 * SAM.gov adapter — fetches federal contract opportunities from the SAM.gov API.
 * Uses native fetch (Node 18+).
 */
class SamGovAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    this.apiKey = process.env.SAM_GOV_API_KEY;
    if (!this.apiKey) {
      throw new AppError('SAM_GOV_API_KEY not configured.', 500);
    }

    // Default: fetch opportunities posted within the last 7 days
    const config = dataSource.config || {};
    this.lookbackDays = config.lookbackDays || 7;
    this.pageLimit = config.pageLimit || 100;
  }

  /**
   * Fetch all pages of results from the SAM.gov opportunities API.
   * @returns {Promise<Array>} Array of raw SAM.gov opportunity records.
   */
  async fetch() {
    const postedTo = new Date();
    const postedFrom = new Date();
    postedFrom.setDate(postedFrom.getDate() - this.lookbackDays);

    const formatDate = (d) => {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    };

    let allRecords = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        postedFrom: formatDate(postedFrom),
        postedTo: formatDate(postedTo),
        limit: String(this.pageLimit),
        offset: String(offset),
      });

      const url = `${SAM_GOV_BASE_URL}?${params.toString()}`;

      logger.info(`SAM.gov fetch: offset=${offset}, limit=${this.pageLimit}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(`SAM.gov API error: ${response.status} - ${body}`);
        throw new AppError(
          `SAM.gov API returned ${response.status}: ${body}`,
          502
        );
      }

      const data = await response.json();
      const records = data.opportunitiesData || [];

      allRecords = allRecords.concat(records);

      // If fewer records returned than the limit, we have reached the last page
      if (records.length < this.pageLimit) {
        hasMore = false;
      } else {
        offset += this.pageLimit;
      }
    }

    logger.info(`SAM.gov fetch complete: ${allRecords.length} records retrieved.`);
    return allRecords;
  }

  /**
   * Transform raw SAM.gov records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw SAM.gov opportunity objects.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const tags = [];
      if (record.classificationCode) {
        tags.push(`classification:${record.classificationCode}`);
      }
      if (record.naicsCode) {
        tags.push(`naics:${record.naicsCode}`);
      }
      if (record.typeOfSetAside) {
        tags.push(`set-aside:${record.typeOfSetAside}`);
      }
      if (record.typeOfSetAsideDescription) {
        tags.push(record.typeOfSetAsideDescription);
      }
      if (record.solicitationNumber) {
        tags.push(`sol:${record.solicitationNumber}`);
      }

      const location =
        (record.placeOfPerformance && record.placeOfPerformance.state && record.placeOfPerformance.state.code) ||
        (record.officeAddress && record.officeAddress.state) ||
        null;

      return {
        type: OPPORTUNITY_TYPES.GOV_CONTRACT,
        source: 'sam_gov',
        sourceId: record.noticeId,
        title: record.title || 'Untitled Opportunity',
        description: record.description || record.solicitationNumber || null,
        sourceUrl: `https://sam.gov/opp/${record.noticeId}/view`,
        status: 'active',
        category: record.naicsCode || 'General',
        tags,
        location,
        value: (record.award && record.award.amount) || null,
        publishedAt: record.postedDate ? new Date(record.postedDate) : null,
        expiresAt: record.responseDeadLine ? new Date(record.responseDeadLine) : null,
        sourceData: record,
      };
    });
  }
}

module.exports = SamGovAdapter;
