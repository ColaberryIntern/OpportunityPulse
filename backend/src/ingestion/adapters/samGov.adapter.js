const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const SAM_GOV_BASE_URL = 'https://api.sam.gov/prod/opportunities/v2/search';

const REQUEST_TIMEOUT_MS = 30000;

const DEFAULT_KEYWORDS = [
  'artificial intelligence',
  'machine learning',
  'AI/ML',
  'data science',
  'natural language processing',
];

/**
 * SAM.gov adapter — fetches federal contract opportunities from the SAM.gov API.
 * Requires a free API key from https://open.gsa.gov/.
 * Uses native fetch (Node 18+).
 */
class SamGovAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    this.apiKey = process.env.SAM_GOV_API_KEY;

    // Default: fetch opportunities posted within the last 7 days
    const config = dataSource.config || {};
    this.lookbackDays = config.lookbackDays || 7;
    this.pageLimit = config.pageLimit || 100;
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
    this.naicsCode = config.naicsCode || null;
  }

  /**
   * Fetch all pages of results from the SAM.gov opportunities API.
   * If SAM_GOV_API_KEY is not set, logs a warning and returns an empty array.
   * @returns {Promise<Array>} Array of raw SAM.gov opportunity records.
   */
  async fetch() {
    if (!this.apiKey) {
      logger.warn(
        'SAM_GOV_API_KEY not configured — skipping SAM.gov ingestion. '
        + 'Register for a free key at https://open.gsa.gov/'
      );
      return [];
    }

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

      // Add keyword search if configured
      if (this.keywords && this.keywords.length > 0) {
        params.set('keyword', this.keywords.join(' OR '));
      }

      // Add NAICS code filter if configured
      if (this.naicsCode) {
        params.set('ncode', this.naicsCode);
      }

      const url = `${SAM_GOV_BASE_URL}?${params.toString()}`;

      logger.info(`SAM.gov fetch: offset=${offset}, limit=${this.pageLimit}`);

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
          const body = await response.text();
          logger.error(`SAM.gov API error: ${response.status} - ${body}`);
          throw new Error(`SAM.gov API returned ${response.status}: ${body}`);
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
      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          logger.error(`SAM.gov fetch timed out at offset ${offset}.`);
          throw new Error(
            `SAM.gov API request timed out after ${REQUEST_TIMEOUT_MS}ms at offset ${offset}.`
          );
        }

        throw error;
      }
    }

    logger.info(`SAM.gov fetch complete: ${allRecords.length} records retrieved.`);
    return allRecords;
  }

  /**
   * Build a human-readable description from the raw SAM.gov API record fields.
   * The API search endpoint returns a URL in the `description` field instead of text,
   * so we construct a useful summary from the available metadata.
   * @param {object} record - Raw SAM.gov opportunity record.
   * @returns {string} Formatted description text.
   */
  static buildDescription(record) {
    const lines = [];

    if (record.type || record.baseType) {
      lines.push(`Type: ${record.type || record.baseType}`);
    }

    if (record.fullParentPathName) {
      const agency = record.fullParentPathName
        .split('.')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' > ');
      lines.push(`Agency: ${agency}`);
    }

    if (record.solicitationNumber) {
      lines.push(`Solicitation: ${record.solicitationNumber}`);
    }

    // Award details
    if (record.award) {
      const amount = record.award.amount
        ? `$${parseFloat(record.award.amount).toLocaleString()}`
        : null;
      const awardee = record.award.awardee;
      if (amount && awardee && awardee.name) {
        const loc = awardee.location;
        const awardeeLocation = loc
          ? ` (${[loc.city?.name, loc.state?.code].filter(Boolean).join(', ')})`
          : '';
        lines.push(`\nAward: ${amount} to ${awardee.name}${awardeeLocation}`);
      } else if (amount) {
        lines.push(`\nAward Amount: ${amount}`);
      }
    }

    // Location
    const perf = record.placeOfPerformance;
    if (perf) {
      const parts = [perf.state?.name, perf.country?.name].filter(Boolean);
      if (parts.length) lines.push(`Location: ${parts.join(', ')}`);
    }

    // Classification
    const codes = [
      record.naicsCode ? `NAICS: ${record.naicsCode}` : null,
      record.classificationCode ? `Classification: ${record.classificationCode}` : null,
    ].filter(Boolean);
    if (codes.length) lines.push(codes.join(' | '));

    // Contact
    const contact = record.pointOfContact && record.pointOfContact[0];
    if (contact) {
      lines.push('');
      if (contact.fullName) lines.push(`Contact: ${contact.fullName}`);
      if (contact.email) lines.push(`Email: ${contact.email}`);
      if (contact.phone) lines.push(`Phone: ${contact.phone}`);
    }

    // Dates
    const dates = [];
    if (record.postedDate) dates.push(`Posted: ${record.postedDate}`);
    if (record.responseDeadLine) dates.push(`Deadline: ${record.responseDeadLine}`);
    if (record.archiveDate) dates.push(`Archive: ${record.archiveDate}`);
    if (dates.length) {
      lines.push('');
      lines.push(dates.join(' | '));
    }

    return lines.join('\n') || record.solicitationNumber || 'No details available.';
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
        description: SamGovAdapter.buildDescription(record),
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
