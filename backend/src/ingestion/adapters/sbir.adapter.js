const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const SBIR_API_URL = 'https://api.www.sbir.gov/public/api/solicitations';

const REQUEST_TIMEOUT_MS = 20000;
// sbir.gov's public API is flaky and rate-limits aggressively; retry so a
// transient 429/5xx/outage does not fail the whole daily run.
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BACKOFF_MS = 3000;
const DEFAULT_MAX_BACKOFF_MS = 60000;
const DEFAULT_INTER_CALL_DELAY_MS = 1500;
const DEFAULT_ROWS = 100;

// Colaberry's domain: education / workforce / data / document-intelligence / AI.
// Each is one keyword query against the solicitation index; results are merged.
const DEFAULT_KEYWORDS = [
  'education', 'workforce', 'training', 'upskilling', 'learning',
  'data analytics', 'document', 'artificial intelligence', 'machine learning',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * SBIR.gov adapter — pulls open SBIR/STTR solicitations from the public API
 * (GET, no key) across Colaberry's domain keywords, with retry/backoff. Output is
 * typed as a gov_contract and stamped with set-aside = the program (SBIR/STTR) +
 * NAICS 541715 so it flows through the SAME gov scoring + SBIR winnability boost.
 */
class SbirAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    const rawKw = config.keywords || config.keyword || DEFAULT_KEYWORDS;
    this.keywords = Array.isArray(rawKw) ? rawKw : [rawKw];
    this.rows = config.rows || DEFAULT_ROWS;
    this.maxRetries = config.maxRetries != null ? config.maxRetries : DEFAULT_MAX_RETRIES;
    this.baseBackoffMs = config.backoffMs || DEFAULT_BACKOFF_MS;
    this.maxBackoffMs = config.maxBackoffMs || DEFAULT_MAX_BACKOFF_MS;
    this.interCallDelayMs = config.interCallDelayMs != null ? config.interCallDelayMs : DEFAULT_INTER_CALL_DELAY_MS;
    this.onlyOpen = config.onlyOpen !== false; // default: open solicitations only
  }

  _retryDelayMs(attempt, retryAfterHeader) {
    if (retryAfterHeader) {
      const secs = parseInt(retryAfterHeader, 10);
      if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, this.maxBackoffMs);
    }
    const expo = this.baseBackoffMs * (2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * this.baseBackoffMs);
    return Math.min(expo + jitter, this.maxBackoffMs);
  }

  async _fetchJsonWithRetry(url, label) {
    for (let attempt = 1; ; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response = null;
      let networkError = null;
      try {
        response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
      } catch (err) { networkError = err; } finally { clearTimeout(timeoutId); }

      if (networkError) {
        const isTimeout = networkError.name === 'AbortError';
        if (attempt <= this.maxRetries) {
          const wait = this._retryDelayMs(attempt, null);
          logger.warn(`SBIR.gov ${label}: ${isTimeout ? 'timeout' : `network error (${networkError.message})`} — retry ${attempt}/${this.maxRetries} in ${wait}ms`);
          await sleep(wait); continue;
        }
        throw isTimeout ? new Error(`SBIR.gov request timed out (${label}) after ${this.maxRetries} retries.`) : networkError;
      }
      if (response.ok) return response.json();
      if ((response.status === 429 || response.status >= 500) && attempt <= this.maxRetries) {
        const wait = this._retryDelayMs(attempt, response.headers.get('retry-after'));
        logger.warn(`SBIR.gov ${label}: HTTP ${response.status} (retryable) — retry ${attempt}/${this.maxRetries} in ${wait}ms`);
        await sleep(wait); continue;
      }
      const body = await response.text().catch(() => '');
      logger.error(`SBIR.gov API error: ${response.status} - ${body.slice(0, 200)}`);
      throw new Error(`SBIR.gov API returned ${response.status} (${label})`);
    }
  }

  async fetch() {
    const byId = new Map();
    let anySuccess = false;
    let lastError = null;
    for (const kw of this.keywords) {
      const params = new URLSearchParams({ keyword: kw, rows: String(this.rows) });
      if (this.onlyOpen) params.set('open', '1');
      const url = `${SBIR_API_URL}?${params.toString()}`;
      logger.info(`SBIR.gov fetch: keyword="${kw}", rows=${this.rows}`);
      try {
        const data = await this._fetchJsonWithRetry(url, `kw "${kw}"`);
        const list = Array.isArray(data) ? data : (data && (data.data || data.results)) || [];
        for (const rec of list) {
          if (!rec) continue;
          const key = String(rec.solicitation_number || rec.solicitation_id || rec.id || JSON.stringify(rec).slice(0, 60));
          byId.set(key, rec);
        }
        anySuccess = true;
      } catch (e) {
        lastError = e;
        logger.warn(`SBIR.gov keyword "${kw}" failed: ${e.message}`);
      }
      await sleep(this.interCallDelayMs);
    }
    // If every keyword failed (e.g. the API is in an outage), surface the error so
    // the run is marked failed rather than silently importing nothing.
    if (!anySuccess && lastError) throw lastError;
    const all = Array.from(byId.values());
    logger.info(`SBIR.gov fetch complete: ${all.length} unique solicitations across ${this.keywords.length} keywords.`);
    return all;
  }

  transform(rawRecords) {
    return rawRecords.map((record) => {
      const program = (record.program || '').toUpperCase().includes('STTR') ? 'STTR' : 'SBIR';
      const agency = record.agency || record.branch || null;
      const description = String(record.solicitation_topics_description || record.abstract || record.description || '').slice(0, 2000);
      const awardValue = record.award_ceiling ? parseFloat(record.award_ceiling) : null;
      const sourceUrl = record.sbir_solicitation_link || record.solicitation_agency_url
        || record.solicitation_url || record.url
        || (record.solicitation_number ? `https://www.sbir.gov/solicitations` : 'https://www.sbir.gov');

      return {
        type: OPPORTUNITY_TYPES.GOV_CONTRACT || 'gov_contract',
        source: 'sbir_gov',
        sourceId: String(record.solicitation_number || record.solicitation_id || record.id),
        title: record.solicitation_title || `${agency || ''} ${program} Solicitation`.trim(),
        description,
        sourceUrl,
        status: 'active',
        category: '541715',
        tags: [program, agency, 'sbir'].filter(Boolean),
        value: (awardValue && !Number.isNaN(awardValue)) ? awardValue : null,
        publishedAt: record.open_date ? new Date(record.open_date) : null,
        expiresAt: (record.close_date || record.application_due_date)
          ? new Date(record.close_date || record.application_due_date) : null,
        // Stamp the fields the gov scorer + Bonfire winnability boost read, so SBIR
        // opps score on the SAME engine and get the SBIR/STTR +20 bid_score lift.
        sourceData: {
          ...record,
          typeOfSetAside: program,
          naicsCode: '541715',
          fullParentPathName: agency || undefined,
        },
      };
    });
  }
}

module.exports = SbirAdapter;
