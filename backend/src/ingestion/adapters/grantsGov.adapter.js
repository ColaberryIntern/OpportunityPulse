const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const GRANTS_GOV_API_URL = 'https://api.grants.gov/v1/api/search2';

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_KEYWORDS = ['artificial intelligence'];
const DEFAULT_ROWS = 100;
const DEFAULT_SORT_BY = 'openDate';

/**
 * Parse a Grants.gov date string that may be in "MMddyyyy" format or ISO format.
 * @param {string} dateStr - Raw date string from the API.
 * @returns {Date|null} Parsed Date object, or null if unparseable.
 */
function parseGrantsGovDate(dateStr) {
  if (!dateStr) return null;

  // Try ISO format first
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime()) && dateStr.includes('-')) {
    return isoDate;
  }

  // Try MMddyyyy format (8-digit string)
  const cleaned = String(dateStr).replace(/\D/g, '');
  if (cleaned.length === 8) {
    const month = parseInt(cleaned.substring(0, 2), 10) - 1;
    const day = parseInt(cleaned.substring(2, 4), 10);
    const year = parseInt(cleaned.substring(4, 8), 10);
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Fallback: attempt generic parse
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Grants.gov adapter — fetches federal grant opportunities
 * from the Grants.gov REST API (POST, no auth required).
 * Uses native fetch (Node 18+).
 */
class GrantsGovAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
    this.rows = config.rows || DEFAULT_ROWS;
    this.sortBy = config.sortBy || DEFAULT_SORT_BY;
  }

  /**
   * Fetch a single keyword search from the Grants.gov API.
   * @param {string} searchTerm - The keyword to search for.
   * @returns {Promise<Array>} Array of raw opportunity records.
   */
  async _fetchSearch(searchTerm) {
    logger.info(`Grants.gov fetch: keyword="${searchTerm}", rows=${this.rows}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(GRANTS_GOV_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          keyword: searchTerm,
          rows: this.rows,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          `Grants.gov API error for "${searchTerm}": ${response.status} - ${errorBody}`
        );
        throw new Error(
          `Grants.gov API returned ${response.status}: ${errorBody}`
        );
      }

      const result = await response.json();
      const opportunities = (result.data?.oppHits || []);

      logger.info(
        `Grants.gov search "${searchTerm}": ${opportunities.length} records retrieved.`
      );

      return opportunities;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(
          `Grants.gov fetch timed out for keyword="${searchTerm}".`
        );
        throw new Error(
          `Grants.gov API request timed out after ${REQUEST_TIMEOUT_MS}ms for keyword="${searchTerm}".`
        );
      }

      throw error;
    }
  }

  /**
   * Fetch grant opportunities from Grants.gov across multiple keyword searches,
   * then deduplicate by oppNumber.
   * @returns {Promise<Array>} Array of unique raw opportunity records.
   */
  async fetch() {
    let allOpportunities = [];

    for (const keyword of this.keywords) {
      const opportunities = await this._fetchSearch(keyword);
      allOpportunities = allOpportunities.concat(opportunities);
    }

    // Deduplicate by number (opportunity number)
    const seen = new Set();
    const uniqueOpportunities = [];
    for (const opp of allOpportunities) {
      const oppId = String(opp.number || opp.id);
      if (!seen.has(oppId)) {
        seen.add(oppId);
        uniqueOpportunities.push(opp);
      }
    }

    logger.info(
      `Grants.gov fetch complete: ${allOpportunities.length} total records, ${uniqueOpportunities.length} unique after deduplication.`
    );

    return uniqueOpportunities;
  }

  /**
   * Transform raw Grants.gov opportunity records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw opportunity objects from the Grants.gov API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      // New API uses 'title' directly, fallback to oppTitle for backwards compat
      const title = record.title || record.oppTitle || 'Untitled Grant';
      const sourceId = String(record.number || record.oppNumber || record.id);
      const tags = Array.isArray(record.cfdaList)
        ? record.cfdaList.filter(Boolean)
        : [];

      return {
        type: OPPORTUNITY_TYPES.GRANT || 'grant',
        source: 'grants_gov',
        sourceId,
        title,
        description: `${record.agency || ''} — ${record.docType || 'grant'}`.substring(0, 2000),
        sourceUrl: `https://www.grants.gov/search-results-detail/${sourceId}`,
        status: 'active',
        category: record.agencyCode || null,
        tags: tags.slice(0, 10),
        value: null,
        publishedAt: parseGrantsGovDate(record.openDate),
        expiresAt: parseGrantsGovDate(record.closeDate),
        sourceData: record,
      };
    });
  }
}

module.exports = GrantsGovAdapter;
