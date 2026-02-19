const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const USAJOBS_API_URL = 'https://data.usajobs.gov/api/Search';

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_KEYWORDS = ['artificial intelligence', 'machine learning'];
const DEFAULT_RESULTS_PER_PAGE = 100;

/**
 * USAJobs.gov adapter — fetches federal job postings
 * from the USAJobs Search API (GET, requires API key).
 * Uses native fetch (Node 18+).
 */
class UsaJobsAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const apiKey = process.env.USAJOBS_API_KEY;
    const userAgent = process.env.USAJOBS_EMAIL;

    if (!apiKey) {
      throw new Error(
        'USAJobs adapter requires USAJOBS_API_KEY environment variable. ' +
        'Register at https://developer.usajobs.gov/APIRequest/Index to obtain a key.'
      );
    }

    if (!userAgent) {
      throw new Error(
        'USAJobs adapter requires USAJOBS_EMAIL environment variable. ' +
        'This should be the email address used to register for the USAJobs API key.'
      );
    }

    this.apiKey = apiKey;
    this.userAgent = userAgent;

    const config = dataSource.config || {};
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
    this.resultsPerPage = config.resultsPerPage || DEFAULT_RESULTS_PER_PAGE;
  }

  /**
   * Fetch a single keyword search from the USAJobs API.
   * @param {string} keyword - The keyword to search for.
   * @returns {Promise<Array>} Array of raw search result items.
   */
  async _fetchSearch(keyword) {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `${USAJOBS_API_URL}?Keyword=${encodedKeyword}&ResultsPerPage=${this.resultsPerPage}`;

    logger.info(`USAJobs fetch: keyword="${keyword}", resultsPerPage=${this.resultsPerPage}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization-Key': this.apiKey,
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          `USAJobs API error for "${keyword}": ${response.status} - ${errorBody}`
        );
        throw new Error(
          `USAJobs API returned ${response.status}: ${errorBody}`
        );
      }

      const data = await response.json();
      const items = (data.SearchResult && data.SearchResult.SearchResultItems) || [];

      logger.info(
        `USAJobs search "${keyword}": ${items.length} records retrieved.`
      );

      return items;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(
          `USAJobs fetch timed out for keyword="${keyword}".`
        );
        throw new Error(
          `USAJobs API request timed out after ${REQUEST_TIMEOUT_MS}ms for keyword="${keyword}".`
        );
      }

      throw error;
    }
  }

  /**
   * Fetch job postings from USAJobs across multiple keyword searches,
   * then deduplicate by PositionID.
   * @returns {Promise<Array>} Array of unique raw search result items.
   */
  async fetch() {
    let allItems = [];

    for (const keyword of this.keywords) {
      const items = await this._fetchSearch(keyword);
      allItems = allItems.concat(items);
    }

    // Deduplicate by PositionID
    const seen = new Set();
    const uniqueItems = [];
    for (const item of allItems) {
      const descriptor = item.MatchedObjectDescriptor || {};
      const positionId = String(descriptor.PositionID);
      if (!seen.has(positionId)) {
        seen.add(positionId);
        uniqueItems.push(item);
      }
    }

    logger.info(
      `USAJobs fetch complete: ${allItems.length} total records, ${uniqueItems.length} unique after deduplication.`
    );

    return uniqueItems;
  }

  /**
   * Transform raw USAJobs search result items into the Opportunity model shape.
   * @param {Array} rawRecords - Raw search result items from the USAJobs API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const item = record.MatchedObjectDescriptor || {};

      const title = [item.PositionTitle, item.OrganizationName]
        .filter(Boolean)
        .join(' \u2014 ');

      // Build description from MajorDuties or QualificationSummary
      let description = '';
      const majorDuties =
        item.UserArea &&
        item.UserArea.Details &&
        item.UserArea.Details.MajorDuties;

      if (Array.isArray(majorDuties) && majorDuties.length > 0) {
        description = majorDuties.join('\n');
      } else {
        description = item.QualificationSummary || '';
      }
      description = description.substring(0, 2000);

      // Parse salary — use maximum range value
      let value = null;
      if (
        Array.isArray(item.PositionRemuneration) &&
        item.PositionRemuneration.length > 0
      ) {
        const remuneration = item.PositionRemuneration[0];
        const maxRange = parseFloat(remuneration.MaximumRange);
        const minRange = parseFloat(remuneration.MinimumRange);
        if (!isNaN(maxRange) && maxRange > 0) {
          value = maxRange;
        } else if (!isNaN(minRange) && minRange > 0) {
          value = minRange;
        }
      }

      // Build tags from job grade code
      const gradeCode =
        Array.isArray(item.JobGrade) &&
        item.JobGrade.length > 0 &&
        item.JobGrade[0].Code;
      const tags = [gradeCode, 'Government'].filter(Boolean);

      // Source URL from ApplyURI
      const sourceUrl =
        Array.isArray(item.ApplyURI) && item.ApplyURI.length > 0
          ? item.ApplyURI[0]
          : null;

      return {
        type: OPPORTUNITY_TYPES.AI_JOB,
        source: 'usajobs',
        sourceId: String(item.PositionID),
        title,
        description,
        sourceUrl,
        status: 'active',
        category: item.DepartmentName || null,
        location: item.PositionLocationDisplay || null,
        tags,
        value,
        publishedAt: item.PublicationStartDate
          ? new Date(item.PublicationStartDate)
          : null,
        expiresAt: item.ApplicationCloseDate
          ? new Date(item.ApplicationCloseDate)
          : null,
        sourceData: item,
      };
    });
  }
}

module.exports = UsaJobsAdapter;
