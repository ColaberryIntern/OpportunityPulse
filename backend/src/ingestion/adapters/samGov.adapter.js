const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const SAM_GOV_BASE_URL = 'https://api.sam.gov/prod/opportunities/v2/search';

const REQUEST_TIMEOUT_MS = 30000;

// SAM.gov enforces a tight rate limit; these defaults make a transient 429/5xx/timeout
// survivable instead of failing the whole daily run. Overridable via dataSource.config.
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BACKOFF_MS = 2000;
const DEFAULT_MAX_BACKOFF_MS = 60000;
const DEFAULT_INTER_PAGE_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    // Reliability knobs (see DEFAULT_* above).
    this.maxRetries = config.maxRetries != null ? config.maxRetries : DEFAULT_MAX_RETRIES;
    this.baseBackoffMs = config.backoffMs || DEFAULT_BACKOFF_MS;
    this.maxBackoffMs = config.maxBackoffMs || DEFAULT_MAX_BACKOFF_MS;
    this.interPageDelayMs = config.interPageDelayMs != null
      ? config.interPageDelayMs
      : DEFAULT_INTER_PAGE_DELAY_MS;
  }

  /**
   * Compute the backoff delay (ms) before a retry. Honors a Retry-After header when
   * present; otherwise exponential backoff with jitter, capped at maxBackoffMs.
   * @param {number} attempt - 1-based number of the attempt that just failed.
   * @param {string|null} retryAfterHeader - value of the Retry-After response header.
   * @returns {number}
   */
  _retryDelayMs(attempt, retryAfterHeader) {
    if (retryAfterHeader) {
      const secs = parseInt(retryAfterHeader, 10);
      if (Number.isFinite(secs) && secs > 0) {
        return Math.min(secs * 1000, this.maxBackoffMs);
      }
    }
    const expo = this.baseBackoffMs * (2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * this.baseBackoffMs);
    return Math.min(expo + jitter, this.maxBackoffMs);
  }

  /**
   * Fetch one page of JSON with retry + backoff. Retries on HTTP 429, HTTP 5xx,
   * network errors, and timeouts up to `maxRetries`; throws immediately on other 4xx
   * (a key/param problem that retrying will not fix) and after retries are exhausted.
   * @param {string} url
   * @param {string} label - log context, e.g. "offset 0".
   * @returns {Promise<object>} parsed JSON body
   */
  async _fetchJsonWithRetry(url, label) {
    for (let attempt = 1; ; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response = null;
      let networkError = null;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
      } catch (err) {
        networkError = err;
      } finally {
        clearTimeout(timeoutId);
      }

      // Network failure or timeout — retryable.
      if (networkError) {
        const isTimeout = networkError.name === 'AbortError';
        if (attempt <= this.maxRetries) {
          const wait = this._retryDelayMs(attempt, null);
          logger.warn(
            `SAM.gov ${label}: ${isTimeout ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : `network error (${networkError.message})`}`
            + ` — retry ${attempt}/${this.maxRetries} in ${wait}ms`
          );
          await sleep(wait);
          continue;
        }
        if (isTimeout) {
          throw new Error(
            `SAM.gov API request timed out after ${REQUEST_TIMEOUT_MS}ms (${label}) after ${this.maxRetries} retries.`
          );
        }
        throw networkError;
      }

      if (response.ok) {
        return response.json();
      }

      // Rate limit (429) or server error (5xx) — retryable with backoff.
      const isRetryable = response.status === 429 || response.status >= 500;
      if (isRetryable && attempt <= this.maxRetries) {
        const wait = this._retryDelayMs(attempt, response.headers.get('retry-after'));
        logger.warn(
          `SAM.gov ${label}: HTTP ${response.status} (retryable) — retry ${attempt}/${this.maxRetries} in ${wait}ms`
        );
        await sleep(wait);
        continue;
      }

      // Non-retryable 4xx, or retries exhausted.
      const body = await response.text().catch(() => '');
      logger.error(`SAM.gov API error: ${response.status} - ${body.slice(0, 300)}`);
      throw new Error(`SAM.gov API returned ${response.status} (${label})`);
    }
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

      const data = await this._fetchJsonWithRetry(url, `offset ${offset}`);
      const records = data.opportunitiesData || [];

      allRecords = allRecords.concat(records);

      // If fewer records returned than the limit, we have reached the last page
      if (records.length < this.pageLimit) {
        hasMore = false;
      } else {
        offset += this.pageLimit;
        // Pace requests to stay under SAM.gov's rate limit between pages
        await sleep(this.interPageDelayMs);
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
