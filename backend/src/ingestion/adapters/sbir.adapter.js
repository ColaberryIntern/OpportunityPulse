const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const SBIR_API_URL = 'https://api.www.sbir.gov/public/api/solicitations';

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_KEYWORD = 'artificial intelligence';
const DEFAULT_ROWS = 50;

/**
 * SBIR.gov adapter — fetches SBIR/STTR solicitations
 * from the SBIR.gov public API (GET, no auth required).
 * Uses native fetch (Node 18+).
 */
class SbirAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.keyword = config.keyword || DEFAULT_KEYWORD;
    this.rows = config.rows || DEFAULT_ROWS;
  }

  /**
   * Fetch solicitations from the SBIR.gov API.
   * @returns {Promise<Array>} Array of raw solicitation records.
   */
  async fetch() {
    const encodedKeyword = encodeURIComponent(this.keyword);
    const url = `${SBIR_API_URL}?keyword=${encodedKeyword}&rows=${this.rows}`;

    logger.info(`SBIR.gov fetch: keyword="${this.keyword}", rows=${this.rows}`);

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
          `SBIR.gov API error: ${response.status} - ${errorBody}`
        );
        throw new Error(
          `SBIR.gov API returned ${response.status}: ${errorBody}`
        );
      }

      const data = await response.json();

      // Response is a JSON array directly (no wrapper)
      const solicitations = Array.isArray(data) ? data : [];

      logger.info(
        `SBIR.gov fetch complete: ${solicitations.length} records retrieved.`
      );

      return solicitations;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(
          `SBIR.gov fetch timed out for keyword="${this.keyword}".`
        );
        throw new Error(
          `SBIR.gov API request timed out after ${REQUEST_TIMEOUT_MS}ms for keyword="${this.keyword}".`
        );
      }

      throw error;
    }
  }

  /**
   * Transform raw SBIR.gov solicitation records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw solicitation objects from the SBIR.gov API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const description = (record.abstract || record.description || '').substring(0, 2000);
      const awardValue = record.award_ceiling ? parseFloat(record.award_ceiling) : null;
      const sourceUrl =
        record.solicitation_url ||
        record.url ||
        `https://www.sbir.gov/node/${record.id}`;

      return {
        type: OPPORTUNITY_TYPES.GRANT || 'grant',
        source: 'sbir_gov',
        sourceId: String(record.solicitation_number),
        title: record.solicitation_title,
        description,
        sourceUrl,
        status: 'active',
        category: record.agency || null,
        tags: [record.program, record.agency].filter(Boolean),
        value: isNaN(awardValue) ? null : awardValue,
        publishedAt: record.open_date ? new Date(record.open_date) : null,
        expiresAt: record.close_date ? new Date(record.close_date) : null,
        sourceData: record,
      };
    });
  }
}

module.exports = SbirAdapter;
