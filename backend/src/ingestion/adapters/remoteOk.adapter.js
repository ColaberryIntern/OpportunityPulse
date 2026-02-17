const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const REMOTE_OK_API_URL = 'https://remoteok.com/api';

const REQUEST_TIMEOUT_MS = 15000;

const AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'ml',
  'deep learning', 'nlp', 'natural language processing',
  'computer vision', 'data science', 'data scientist',
  'llm', 'gpt', 'neural network',
];

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
 * Check if a job matches AI/ML keywords based on position, tags, and description.
 * @param {object} job - Raw job object from RemoteOK.
 * @returns {boolean}
 */
function isAiRelated(job) {
  const searchText = [
    job.position || '',
    (job.tags || []).join(' '),
    (job.description || '').substring(0, 500),
  ].join(' ').toLowerCase();

  return AI_KEYWORDS.some((kw) => searchText.includes(kw));
}

/**
 * RemoteOK adapter — fetches real remote job postings from the RemoteOK
 * free public API (no auth required). Filters for AI/ML-related positions.
 * Uses native fetch (Node 18+).
 */
class RemoteOkAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);

    const config = dataSource.config || {};
    this.searches = config.searches || ['ai', 'machine learning', 'artificial intelligence'];
  }

  /**
   * Fetch job listings from the RemoteOK API.
   * The API returns a JSON array where the first element is metadata.
   * @returns {Promise<Array>} Array of raw job records (AI/ML filtered).
   */
  async fetch() {
    logger.info('RemoteOK fetch: requesting all remote jobs...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(REMOTE_OK_API_URL, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OpportunityPulse/1.0 (https://github.com/ColaberryIntern/OpportunityPulse)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(`RemoteOK API error: ${response.status} - ${errorBody}`);
        throw new Error(`RemoteOK API returned ${response.status}: ${errorBody}`);
      }

      const data = await response.json();

      // First element is metadata/legal notice — skip it
      const jobs = Array.isArray(data) ? data.slice(1) : [];

      // Filter for AI/ML-related jobs
      const aiJobs = jobs.filter(isAiRelated);

      logger.info(
        `RemoteOK fetch complete: ${jobs.length} total jobs, ${aiJobs.length} AI/ML-related.`
      );

      return aiJobs;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error('RemoteOK fetch timed out.');
        throw new Error(`RemoteOK API request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      }

      throw error;
    }
  }

  /**
   * Transform raw RemoteOK job records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw job objects from the API.
   * @returns {Array} Transformed opportunity objects.
   */
  transform(rawRecords) {
    return rawRecords.map((record) => ({
      type: OPPORTUNITY_TYPES.AI_JOB,
      source: 'remote_ok',
      sourceId: String(record.id),
      title: `${record.position || 'Untitled'} — ${record.company || 'Unknown'}`,
      description: stripHtml(record.description).substring(0, 2000),
      sourceUrl: record.url || `https://remoteok.com/remote-jobs/${record.id}`,
      status: 'active',
      category: 'AI/ML',
      tags: (record.tags || []).slice(0, 10),
      location: record.location || 'Remote',
      value: record.salary_max || record.salary_min || null,
      publishedAt: record.date ? new Date(record.date) : null,
      expiresAt: null,
      sourceData: record,
    }));
  }
}

module.exports = RemoteOkAdapter;
