const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

/**
 * Public SAM.gov search endpoint — the same one sam.gov's own search box calls.
 * Requires no API key, so this adapter keeps working when the keyed
 * `sam_gov` source is down (expired key, quota, entity-registration lapse).
 *
 * It answers ONLY to `Accept: application/hal+json`. Sending plain
 * `application/json` returns 406 Not Acceptable on every request.
 */
const SAM_GOV_SEARCH_URL = 'https://sam.gov/api/prod/sgs/v1/search/';

const SAM_GOV_ACCEPT = 'application/hal+json';

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Default AI-related search keywords.
 */
const DEFAULT_KEYWORDS = [
  'artificial intelligence',
  'machine learning',
  'AI/ML',
  'data science',
  'natural language processing',
];

/**
 * Strip HTML tags and collapse whitespace. SAM returns description bodies as
 * HTML fragments; the Opportunity model stores plain text.
 *
 * @param {string|null} html
 * @returns {string|null}
 */
function stripHtml(html) {
  if (!html) return null;
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/**
 * SamGovScraperAdapter — fetches AI-related federal contract opportunities
 * from SAM.gov's public website search endpoint without requiring an API key.
 *
 * Failure policy: if SAM.gov is unreachable or returns an error, this adapter
 * THROWS. It never substitutes placeholder records. A visibly failing source is
 * safe; invented federal opportunities flowing into the bid pipeline are not.
 */
class SamGovScraperAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.keywords = config.keywords || DEFAULT_KEYWORDS;
    this.maxResults = config.maxResults || 25;
  }

  /**
   * Fetch opportunities for every configured keyword and deduplicate by SAM's
   * notice id. Individual keyword failures are tolerated; if EVERY keyword
   * fails the error is rethrown so the ingestion run is recorded as failed.
   *
   * @returns {Promise<Array>} Array of raw opportunity records.
   * @throws {Error} When no keyword could be fetched.
   */
  async fetch() {
    const all = [];
    const failures = [];

    for (const keyword of this.keywords) {
      try {
        const records = await this._fetchKeyword(keyword);
        logger.info(
          `SAM.gov scraper: fetched ${records.length} records for keyword "${keyword}".`
        );
        all.push(...records);
      } catch (err) {
        failures.push(`${keyword}: ${err.message}`);
        logger.warn(
          `SAM.gov scraper: failed for keyword "${keyword}": ${err.message}`
        );
      }
    }

    if (failures.length === this.keywords.length) {
      throw new Error(
        `SAM.gov public search failed for all ${this.keywords.length} keywords — ${failures.join('; ')}`
      );
    }

    const seen = new Set();
    const unique = [];
    for (const record of all) {
      if (!record.noticeId || seen.has(record.noticeId)) continue;
      seen.add(record.noticeId);
      unique.push(record);
    }

    logger.info(
      `SAM.gov scraper fetch complete: ${all.length} total records, ${unique.length} unique after deduplication.`
    );

    return unique;
  }

  /**
   * Query the public SAM.gov search endpoint for a single keyword.
   *
   * @param {string} keyword - Search term.
   * @returns {Promise<Array>} Array of normalised records.
   * @throws {Error} On HTTP or network failure.
   */
  async _fetchKeyword(keyword) {
    const params = new URLSearchParams({
      index: 'opp',
      q: keyword,
      page: '0',
      size: String(this.maxResults),
      sort: '-modifiedDate',
    });

    const url = `${SAM_GOV_SEARCH_URL}?${params.toString()}`;

    logger.info(`SAM.gov scraper: querying "${keyword}" — ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: SAM_GOV_ACCEPT,
        'User-Agent': 'OpportunityPulse/1.0 (Federal Opportunity Tracker)',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`SAM.gov returned HTTP ${response.status}`);
    }

    const data = await response.json();

    const results = (data._embedded && data._embedded.results) || [];

    if (!Array.isArray(results)) {
      return [];
    }

    // The endpoint has no reliable server-side active filter, so drop archived
    // and cancelled notices here rather than ingesting dead opportunities.
    return results
      .filter((item) => item.isActive !== false && item.isCanceled !== true)
      .map((item) => this._normaliseSearchResult(item));
  }

  /**
   * Normalise a SAM.gov public-search result into the shape transform() expects.
   *
   * The public search payload uses different field names from the keyed
   * opportunities API (`publishDate` not `postedDate`, `descriptions[]` not
   * `description`, `naics[]` not `naicsCode`, `responseDate` not
   * `responseDeadLine`, `psc[]` not `classificationCode`).
   *
   * @param {object} item - Single result from SAM.gov search JSON.
   * @returns {object} Normalised record.
   */
  _normaliseSearchResult(item) {
    // organizationHierarchy runs department -> agency -> office; the most
    // specific named level is the useful attribution.
    const hierarchy = Array.isArray(item.organizationHierarchy)
      ? item.organizationHierarchy.filter((o) => o && o.name)
      : [];
    const agency = hierarchy.length ? hierarchy[hierarchy.length - 1].name : null;

    const naics = Array.isArray(item.naics) ? item.naics : [];
    const psc = Array.isArray(item.psc) ? item.psc.filter((p) => p && p.code) : [];

    const descriptions = Array.isArray(item.descriptions) ? item.descriptions : [];
    const description = stripHtml(descriptions.length ? descriptions[0].content : null);

    const pop = Array.isArray(item.placeOfPerformance)
      ? item.placeOfPerformance[0]
      : item.placeOfPerformance;

    return {
      noticeId: item._id || item.solicitationNumber || null,
      title: item.title || 'Untitled Opportunity',
      description,
      agency,
      solicitationNumber:
        item.solicitationNumber || item.cleanSolicitationNumber || null,
      postedDate: item.publishDate || null,
      responseDeadLine: item.responseDate || null,
      naicsCode: naics.length ? naics[0].code : null,
      classificationCode: psc.length ? psc[0].code : null,
      noticeType: (item.type && item.type.value) || null,
      setAside:
        (item.solicitation &&
          (item.solicitation.setAside || item.solicitation.originalSetAside)) ||
        null,
      estimatedValue: (item.award && item.award.amount) || null,
      placeOfPerformance: pop || null,
    };
  }

  /**
   * Transform raw records into the Opportunity model shape.
   *
   * Produces the same output shape as SamGovAdapter.transform().
   *
   * @param {Array} rawRecords - Raw opportunity records.
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
      if (record.solicitationNumber) {
        tags.push(`sol:${record.solicitationNumber}`);
      }
      if (record.agency) {
        tags.push(`agency:${record.agency}`);
      }
      if (record.setAside) {
        tags.push(`setaside:${record.setAside}`);
      }
      if (record.noticeType) {
        tags.push(`type:${record.noticeType}`);
      }

      const location =
        (record.placeOfPerformance &&
          record.placeOfPerformance.state &&
          (record.placeOfPerformance.state.code ||
            record.placeOfPerformance.state)) ||
        null;

      const publishedAt = record.postedDate ? new Date(record.postedDate) : null;
      const expiresAt = record.responseDeadLine
        ? new Date(record.responseDeadLine)
        : null;

      return {
        type: OPPORTUNITY_TYPES.GOV_CONTRACT,
        source: 'sam_gov_scraper',
        sourceId: record.noticeId,
        title: record.title || 'Untitled Opportunity',
        description: record.description || record.solicitationNumber || null,
        sourceUrl: record.noticeId
          ? `https://sam.gov/opp/${record.noticeId}/view`
          : null,
        status: 'active',
        category: record.naicsCode || 'General',
        tags,
        location: typeof location === 'string' ? location : null,
        value: record.estimatedValue || null,
        publishedAt:
          publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        sourceData: record,
      };
    });
  }
}

module.exports = SamGovScraperAdapter;
