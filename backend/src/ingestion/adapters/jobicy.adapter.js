const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const JOBICY_API_URL = 'https://jobicy.com/api/v2/remote-jobs';

const REQUEST_TIMEOUT_MS = 15000;
// Jobicy rejects a tag outside 3-50 chars with HTTP 400. 'ai' was here and is
// 2 chars, so EVERY run 400'd on the first tag and — because one throw aborted
// the whole loop — the two valid tags never ran either. Verified against the
// live API on 2026-10-12: 'ai' 400s, 'artificial-intelligence' 200s.
const MIN_TAG_LENGTH = 3;
const MAX_TAG_LENGTH = 50;
const DEFAULT_TAGS = ['artificial-intelligence', 'machine-learning', 'data-science'];
const DEFAULT_COUNT = 50;

/**
 * Keep only tags the Jobicy API will accept. Invalid tags are dropped rather
 * than sent, because the API answers a bad tag with 400 for the whole request.
 * Validating here covers tags from the DataSource config row too, not just the
 * defaults — production's row still carries the 2-char 'ai'.
 * @param {Array<string>} tags - Candidate tags.
 * @returns {{valid: Array<string>, dropped: Array<string>}}
 */
function partitionTags(tags) {
  const valid = [];
  const dropped = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    if (tag.length >= MIN_TAG_LENGTH && tag.length <= MAX_TAG_LENGTH) valid.push(tag);
    else dropped.push(String(raw));
  }
  return { valid, dropped };
}

/**
 * Strip HTML tags from a string and collapse whitespace.
 * @param {string} html - Raw HTML string.
 * @returns {string} Plain text.
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Jobicy adapter — fetches real remote AI/ML job postings from the Jobicy
 * free public API (no auth required). Searches multiple tags and deduplicates.
 * Uses native fetch (Node 18+).
 */
class JobicyAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    const { valid, dropped } = partitionTags(config.tags || DEFAULT_TAGS);
    if (dropped.length) {
      logger.warn('Jobicy: dropping tags outside the 3-50 character bound the API enforces.', {
        dropped, kept: valid,
      });
    }
    // If the configured tags are ALL invalid, fall back to the known-good
    // defaults rather than fetching nothing and reporting a silent success.
    this.tags = valid.length ? valid : partitionTags(DEFAULT_TAGS).valid;
    this.count = config.count || DEFAULT_COUNT;
  }

  /**
   * Fetch jobs for a single tag from the Jobicy API.
   * @param {string} tag - The tag to search for.
   * @returns {Promise<Array>} Array of raw job records.
   */
  async _fetchTag(tag) {
    const url = `${JOBICY_API_URL}?count=${this.count}&tag=${encodeURIComponent(tag)}`;

    logger.info(`Jobicy fetch: tag="${tag}", count=${this.count}`);

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
        logger.error(`Jobicy API error for tag="${tag}": ${response.status} - ${errorBody}`);
        throw new Error(`Jobicy API returned ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const jobs = data.jobs || [];

      logger.info(`Jobicy tag "${tag}": ${jobs.length} records retrieved.`);

      return jobs;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(`Jobicy fetch timed out for tag="${tag}".`);
        throw new Error(
          `Jobicy API request timed out after ${REQUEST_TIMEOUT_MS}ms for tag="${tag}".`
        );
      }

      throw error;
    }
  }

  /**
   * Fetch AI/ML jobs from Jobicy across multiple tags, then deduplicate by job ID.
   * @returns {Promise<Array>} Array of unique raw job records.
   */
  async fetch() {
    let allJobs = [];
    const failures = [];

    // Per-tag isolation: one tag failing must not cost us the others. Before
    // this, a single bad tag threw straight out of the loop and the whole
    // source reported `failed` with zero records.
    for (const tag of this.tags) {
      try {
        const jobs = await this._fetchTag(tag);
        allJobs = allJobs.concat(jobs);
      } catch (error) {
        failures.push({ tag, error: error.message });
        logger.warn(`Jobicy: tag "${tag}" failed; continuing with remaining tags.`, {
          tag, error: error.message,
        });
      }
    }

    // Every tag failing is a real outage, not a quiet empty result — surface it
    // so the source is marked failed instead of silently reporting 0 records.
    if (failures.length === this.tags.length && this.tags.length > 0) {
      throw new Error(
        `Jobicy: all ${this.tags.length} tag(s) failed — ${failures.map((f) => `${f.tag}: ${f.error}`).join('; ')}`
      );
    }

    // Deduplicate by job ID
    const seen = new Set();
    const uniqueJobs = [];
    for (const job of allJobs) {
      const jobId = String(job.id);
      if (!seen.has(jobId)) {
        seen.add(jobId);
        uniqueJobs.push(job);
      }
    }

    logger.info(
      `Jobicy fetch complete: ${allJobs.length} total records, ${uniqueJobs.length} unique after deduplication.`
    );

    return uniqueJobs;
  }

  /**
   * Transform raw Jobicy job records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw job objects from the API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => {
      const tags = [];
      if (record.jobIndustry) {
        const industries = Array.isArray(record.jobIndustry)
          ? record.jobIndustry.map((i) => (typeof i === 'string' ? i : String(i)))
          : [String(record.jobIndustry)];
        // Sanitize: remove curly braces and HTML entities that break PostgreSQL ARRAY
        tags.push(...industries
          .map((t) => t.replace(/[{}]/g, '').replace(/&amp;/g, '&').trim())
          .filter(Boolean)
          .slice(0, 5));
      }
      if (record.jobType) {
        const cleanType = String(record.jobType).replace(/[{}]/g, '').trim();
        if (cleanType) tags.push(cleanType);
      }

      const salary = record.annualSalaryMax || record.annualSalaryMin || null;

      return {
        type: OPPORTUNITY_TYPES.AI_JOB,
        source: 'jobicy',
        sourceId: String(record.id),
        title: `${record.jobTitle || 'Untitled'} — ${record.companyName || 'Unknown'}`,
        description: stripHtml(record.jobExcerpt || record.jobDescription || '').substring(0, 2000),
        sourceUrl: record.url || `https://jobicy.com/jobs/${record.id}`,
        status: 'active',
        category: 'AI/ML',
        tags: tags.slice(0, 10),
        location: record.jobGeo || 'Remote',
        value: salary ? Number(salary) : null,
        publishedAt: record.pubDate ? new Date(record.pubDate) : null,
        expiresAt: null,
        sourceData: record,
      };
    });
  }
}

module.exports = JobicyAdapter;
