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

/**
 * Thrown when SAM.gov reports the API key's DAILY quota is exhausted (HTTP 429,
 * body code 900804 / "exceeded your quota"). Unlike a transient burst-rate 429,
 * this cannot be cured by retrying — the key is blocked until midnight UTC — so
 * it aborts the run immediately instead of hammering the cap with retries.
 */
class SamQuotaExhaustedError extends Error {
  constructor(message, nextAccessTime) {
    super(message);
    this.name = 'SamQuotaExhaustedError';
    this.code = 'QUOTA_EXHAUSTED';
    this.nextAccessTime = nextAccessTime || null;
  }
}

// A 429 body is treated as daily-quota exhaustion (not transient) when it matches.
const QUOTA_BODY_RE = /exceeded your quota|900804/i;

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

    // SAM.gov's `ncode` param accepts a SINGLE NAICS code — a comma-list silently
    // matches nothing. Support a list by issuing one query per code and merging.
    // Accepts config.naicsCodes (array) or a comma-separated config.naicsCode string.
    const rawNaics = config.naicsCodes || config.naicsCode || null;
    this.naicsCodes = Array.isArray(rawNaics)
      ? rawNaics.map((c) => String(c).trim()).filter(Boolean)
      : (rawNaics ? String(rawNaics).split(',').map((c) => c.trim()).filter(Boolean) : []);

    // Daily-quota fit: a low-tier (personal/non-federal) SAM.gov key is capped at
    // a small number of requests/day, so fanning out every NAICS each run exhausts
    // it on the first call. When `naicsPerRun` is set, only that many codes are
    // queried per run, ROTATING by day so all codes are covered over several days.
    // `maxPagesPerQuery` further bounds pagination so one NAICS can't drain the cap.
    // Both default to "no limit" (correct behavior once a system-account key with a
    // 1,000/day quota is provisioned). See OPPORTUNITY_PULSE_EXPOSURE_AUDIT.md.
    this.naicsPerRun = config.naicsPerRun != null ? Number(config.naicsPerRun) : null;
    this.maxPagesPerQuery = config.maxPagesPerQuery != null
      ? Number(config.maxPagesPerQuery)
      : Infinity;

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

      // Read the (error) body once and reuse it for both quota classification and
      // the final error log — Response bodies can only be consumed a single time.
      const body = await response.text().catch(() => '');

      // Daily-quota exhaustion (429 + quota body) is NOT retryable — the key is
      // blocked until midnight UTC. Detect it and abort immediately so we don't
      // burn the remaining cap (and minutes of backoff) on doomed retries.
      if (response.status === 429 && QUOTA_BODY_RE.test(body)) {
        let nextAccessTime = null;
        try { nextAccessTime = JSON.parse(body).nextAccessTime || null; } catch { /* non-JSON body */ }
        logger.warn(
          `SAM.gov ${label}: daily API quota exhausted${nextAccessTime ? ` (resets ${nextAccessTime})` : ''}`
          + ' — aborting run. Provision a non-federal system-account key (1,000/day) or lower naicsPerRun.'
        );
        throw new SamQuotaExhaustedError(`SAM.gov daily quota exhausted (${label})`, nextAccessTime);
      }

      // Transient rate limit (429 burst) or server error (5xx) — retryable with backoff.
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
      logger.error(`SAM.gov API error: ${response.status} - ${body.slice(0, 300)}`);
      throw new Error(`SAM.gov API returned ${response.status} (${label})`);
    }
  }

  /**
   * Choose which NAICS codes to query this run. Returns all codes when
   * `naicsPerRun` is unset; otherwise a rotating window of that size keyed on the
   * current day, so every code is covered over ceil(total / naicsPerRun) days.
   * @returns {string[]}
   */
  _selectNaicsForRun() {
    const all = this.naicsCodes;
    if (!this.naicsPerRun || this.naicsPerRun >= all.length || all.length === 0) {
      return all;
    }
    const dayIndex = Math.floor(Date.now() / 86400000); // days since epoch (UTC)
    const start = (dayIndex * this.naicsPerRun) % all.length;
    const window = [];
    for (let i = 0; i < this.naicsPerRun; i += 1) {
      window.push(all[(start + i) % all.length]);
    }
    return window;
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

    // Select the NAICS codes for THIS run. With naicsPerRun set, take a rotating
    // window keyed on the day so a low-quota key covers all codes over several
    // days instead of exhausting the cap on the first call each day.
    const naicsForRun = this._selectNaicsForRun();

    // Build the query set: one query per NAICS code (each code already scopes to a
    // relevant industry), or a single keyword query when no NAICS is configured.
    const queries = naicsForRun.length > 0
      ? naicsForRun.map((code) => ({ ncode: code, label: `naics ${code}` }))
      : [{
        keyword: (this.keywords && this.keywords.length > 0) ? this.keywords.join(' OR ') : null,
        label: 'keyword',
      }];
    if (this.naicsPerRun != null && this.naicsCodes.length > 0) {
      logger.info(
        `SAM.gov: querying ${naicsForRun.length}/${this.naicsCodes.length} NAICS this run `
        + `(rotating, ${this.maxPagesPerQuery === Infinity ? 'no' : this.maxPagesPerQuery} page cap): ${naicsForRun.join(', ')}`
      );
    }

    // Dedup across queries by noticeId (the same opportunity can match >1 NAICS).
    const byId = new Map();

    try {
    for (const query of queries) {
      let offset = 0;
      let hasMore = true;
      let pagesFetched = 0;

      while (hasMore) {
        const params = new URLSearchParams({
          api_key: this.apiKey,
          postedFrom: formatDate(postedFrom),
          postedTo: formatDate(postedTo),
          limit: String(this.pageLimit),
          offset: String(offset),
        });
        if (query.ncode) params.set('ncode', query.ncode);
        if (query.keyword) params.set('keyword', query.keyword);

        const url = `${SAM_GOV_BASE_URL}?${params.toString()}`;
        logger.info(`SAM.gov fetch: ${query.label} offset=${offset}, limit=${this.pageLimit}`);

        const data = await this._fetchJsonWithRetry(url, `${query.label} offset ${offset}`);
        const records = data.opportunitiesData || [];

        for (const rec of records) {
          if (!rec) continue;
          const key = rec.noticeId || `${query.label}:${offset}:${byId.size}`;
          byId.set(key, rec);
        }

        pagesFetched += 1;
        if (records.length < this.pageLimit || pagesFetched >= this.maxPagesPerQuery) {
          hasMore = false;
        } else {
          offset += this.pageLimit;
          // Pace requests to stay under SAM.gov's rate limit between pages
          await sleep(this.interPageDelayMs);
        }
      }

      // Brief pause between per-NAICS queries as well
      if (queries.length > 1) await sleep(this.interPageDelayMs);
    }
    } catch (err) {
      // Quota exhaustion aborts the run but keeps whatever we already collected,
      // so the day isn't a total loss and the source row records partial success.
      if (err && err.code === 'QUOTA_EXHAUSTED') {
        logger.warn(`SAM.gov: stopping early on quota — returning ${byId.size} record(s) collected before the cap.`);
      } else {
        throw err;
      }
    }

    const allRecords = Array.from(byId.values());
    logger.info(
      `SAM.gov fetch complete: ${allRecords.length} unique records across ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}.`
    );
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
module.exports.SamQuotaExhaustedError = SamQuotaExhaustedError;
