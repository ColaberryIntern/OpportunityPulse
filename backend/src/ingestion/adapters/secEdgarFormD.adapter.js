const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');
const { scoreInvestment } = require('../../utils/investmentScore');

// SEC EDGAR Form D adapter — primary-source U.S. private capital raises.
//
// Why: the capital channel was single-sourced on funding-news RSS, which is
// secondary reporting (a journalist has to write it up). Form D is the filing
// a company submits with the SEC when it raises money in an exempt (private)
// offering — it's the raise itself, not coverage of it. Free, no API key.
//
// Source: EDGAR full-text search JSON API. We restrict to forms=D and AI/tech
// keywords so the channel stays on-topic rather than ingesting every private
// raise in the country.
//
// SEC usage policy requires a descriptive User-Agent with a contact address
// (https://www.sec.gov/os/webmaster-faq#developers) and rate-limits to ~10
// req/s. We send well under that. The contact string is configurable via
// SEC_EDGAR_USER_AGENT so it can be set per-deployment without a code change.
//
// NOTE: ships DISABLED. Flip the data_sources row to enabled:true only after a
// manual smoke run confirms the live response shape (POST /api/v1/ingestion
// for sec_edgar_formd). Until verified, a schema drift here fails closed
// (caught + logged) and cannot pollute production because the source is off.

const EDGAR_FTS_URL = 'https://efts.sec.gov/LATEST/search-index';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

const DEFAULT_KEYWORDS = [
  'artificial intelligence',
  'machine learning',
  'generative AI',
];
const DEFAULT_USER_AGENT = 'Opportunity Pulse (ali@colaberry.com)';

/**
 * Sleep for ms milliseconds (used for backoff between retries).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SecEdgarFormDAdapter — fetches recent Form D (exempt offering) filings whose
 * full text matches AI/tech keywords, via the EDGAR full-text search API.
 */
class SecEdgarFormDAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
    this.userAgent = process.env.SEC_EDGAR_USER_AGENT || config.userAgent || DEFAULT_USER_AGENT;
    this.maxPerKeyword = config.maxPerKeyword || 30;
  }

  /**
   * GET the EDGAR FTS endpoint with timeout + bounded exponential backoff.
   * A single keyword failure is thrown to the caller, which isolates it so
   * other keywords still process (BREAK: upstream timeout / 5xx / rate-limit).
   * @param {string} keyword
   * @returns {Promise<Array>} Raw hit objects (possibly empty).
   */
  async _search(keyword) {
    const params = new URLSearchParams({ q: `"${keyword}"`, forms: 'D' });
    const url = `${EDGAR_FTS_URL}?${params.toString()}`;

    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        logger.info(`SEC EDGAR FormD fetch: keyword="${keyword}" attempt=${attempt}`);
        const response = await fetch(url, {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.status === 429 || response.status >= 500) {
          // transient — retry with backoff
          throw new Error(`EDGAR returned ${response.status}`);
        }
        if (!response.ok) {
          const body = await response.text();
          // non-transient (4xx other than 429): don't retry, surface clearly
          throw Object.assign(new Error(`EDGAR returned ${response.status}: ${body.slice(0, 200)}`), {
            fatal: true,
          });
        }

        const json = await response.json();
        const hits = json?.hits?.hits;
        const rows = Array.isArray(hits) ? hits.slice(0, this.maxPerKeyword) : [];
        logger.info(`SEC EDGAR FormD "${keyword}": ${rows.length} hits.`);
        return rows.map((h) => ({ ...h, _keyword: keyword }));
      } catch (error) {
        clearTimeout(timeoutId);
        lastErr = error;
        if (error.fatal || attempt > MAX_RETRIES) break;
        const backoff = RETRY_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
        logger.warn(`SEC EDGAR FormD "${keyword}" attempt ${attempt} failed (${error.message}); retrying in ${backoff}ms`);
        await delay(backoff);
      }
    }
    throw lastErr || new Error(`EDGAR search failed for "${keyword}"`);
  }

  /**
   * Fetch across all keywords, isolating per-keyword failures, and dedupe by
   * filing id so the same raise matched by two keywords appears once.
   * @returns {Promise<Array>} Unique raw hits.
   */
  async fetch() {
    const all = [];
    for (const keyword of this.keywords) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const rows = await this._search(keyword);
        all.push(...rows);
      } catch (error) {
        // BREAK→HARDEN: one bad keyword must not sink the whole run.
        logger.error(`SEC EDGAR FormD keyword "${keyword}" failed: ${error.message}`);
      }
    }

    const seen = new Set();
    const unique = [];
    for (const hit of all) {
      const id = hit._id || hit?._source?.adsh || JSON.stringify(hit).slice(0, 64);
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(hit);
    }
    logger.info(`SEC EDGAR FormD fetch complete: ${all.length} hits, ${unique.length} unique.`);
    return unique;
  }

  /**
   * Map an EDGAR FTS hit into the Opportunity shape. EDGAR FTS `_id` is
   * "<accession>:<file>"; `_source.display_names` is ["Issuer Name (CIK ...)"].
   * Amount (totalAmountSold) is not in the FTS index — it lives in the filing's
   * primary_doc.xml. v1 leaves value null and ranks on recency + relevance;
   * amount enrichment is a documented follow-up (one extra fetch per filing).
   * @param {Array} rawRecords
   * @returns {Array} Transformed opportunities.
   */
  transform(rawRecords) {
    return rawRecords.map((hit) => {
      const src = hit._source || {};
      const accession = String(hit._id || src.adsh || '').split(':')[0];
      const displayName = Array.isArray(src.display_names) && src.display_names.length
        ? src.display_names[0]
        : 'Unknown issuer';
      const issuer = displayName.replace(/\s*\(CIK\s*\d+\)\s*$/i, '').trim();
      const cikMatch = displayName.match(/CIK\s*(\d+)/i);
      const cik = cikMatch ? cikMatch[1] : (Array.isArray(src.cik) ? src.cik[0] : src.cik);
      const fileDate = src.file_date || src.fileDate || null;
      const publishedAt = fileDate ? new Date(fileDate) : null;

      const accessionNoDashes = accession.replace(/-/g, '');
      const sourceUrl = cik && accessionNoDashes
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=D&dateb=&owner=include&count=10`
        : 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=D';

      const title = `${issuer} — Form D exempt offering`;
      const description = `${issuer} filed a Form D with the SEC, indicating a private (exempt) securities offering. Matched on: ${hit._keyword}. Filing date ${fileDate || 'unknown'}.`;
      const tags = ['form-d', 'private-raise', 'sec', hit._keyword].filter(Boolean);

      return {
        type: OPPORTUNITY_TYPES.INVESTMENT,
        source: 'sec_edgar_formd',
        sourceId: accession || `${issuer}-${fileDate}`,
        title: title.slice(0, 250),
        description: description.slice(0, 2000),
        sourceUrl,
        status: 'active',
        category: 'Private offering (Form D)',
        tags: tags.slice(0, 10),
        location: null,
        value: null, // see note above — amount lives in primary_doc.xml
        publishedAt,
        aiScore: scoreInvestment({ value: null, publishedAt, title, description, tags }),
        expiresAt: null,
        sourceData: hit,
      };
    });
  }
}

module.exports = SecEdgarFormDAdapter;
