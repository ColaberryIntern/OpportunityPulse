const BaseAdapter = require('./base.adapter');
const { OPPORTUNITY_TYPES } = require('../../config/constants');
const logger = require('../../logging/logger');

const FREELANCER_API_BASE = 'https://www.freelancer.com/api/projects/0.1/projects/active/';
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_SEARCHES = ['AI', 'machine learning', 'NLP', 'computer vision'];
const DEFAULT_LIMIT = 50;

/**
 * Freelancer.com API adapter — fetches AI freelance projects
 * from the Freelancer.com public API.
 */
class FreelancerApiAdapter extends BaseAdapter {
  constructor(dataSource) {
    super(dataSource);
    const config = dataSource.config || {};
    this.searches = config.searches || DEFAULT_SEARCHES;
    this.limit = config.limit || DEFAULT_LIMIT;
    this.baseUrl = config.baseUrl || FREELANCER_API_BASE;
  }

  async _fetchSearch(searchTerm) {
    const params = new URLSearchParams({
      query: searchTerm,
      limit: String(this.limit),
      compact: 'true',
      job_details: 'true',
      user_details: 'true',
    });

    const url = `${this.baseUrl}?${params}`;
    logger.info(`Freelancer API fetch: search="${searchTerm}", limit=${this.limit}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OpportunityPulse/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(`Freelancer API error for "${searchTerm}": ${response.status} - ${errorBody}`);
        throw new Error(`Freelancer API returned ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const projects = data.result?.projects || [];

      logger.info(`Freelancer search "${searchTerm}": ${projects.length} projects retrieved`);
      return projects;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        logger.error(`Freelancer fetch timed out for search="${searchTerm}"`);
        throw new Error(`Freelancer API timed out after ${REQUEST_TIMEOUT_MS}ms for "${searchTerm}"`);
      }

      throw error;
    }
  }

  async fetch() {
    let allProjects = [];

    for (const searchTerm of this.searches) {
      try {
        const projects = await this._fetchSearch(searchTerm);
        allProjects = allProjects.concat(projects);
      } catch (error) {
        logger.warn(`Freelancer search "${searchTerm}" failed: ${error.message}`);
      }
    }

    // Deduplicate by project ID
    const seen = new Set();
    const unique = [];
    for (const project of allProjects) {
      const id = String(project.id);
      if (!seen.has(id)) {
        seen.add(id);
        unique.push(project);
      }
    }

    logger.info(`Freelancer fetch complete: ${allProjects.length} total, ${unique.length} unique`);
    return unique;
  }

  transform(rawRecords) {
    return rawRecords.map((project) => {
      const budgetMin = project.budget?.minimum || null;
      const budgetMax = project.budget?.maximum || null;
      const value = budgetMax || budgetMin || null;
      const skills = (project.jobs || []).map((j) => j.name || j).filter(Boolean);

      return {
        type: OPPORTUNITY_TYPES.FREELANCE,
        source: 'freelancer',
        sourceId: String(project.id),
        title: (project.title || 'Untitled Project').substring(0, 500),
        description: (project.preview_description || project.description || '').substring(0, 2000),
        sourceUrl: `https://www.freelancer.com/projects/${project.seo_url || project.id}`,
        status: 'active',
        category: 'Freelance',
        tags: skills.slice(0, 10),
        location: project.owner?.location?.country?.name || 'Remote',
        value,
        publishedAt: project.time_submitted
          ? new Date(project.time_submitted * 1000)
          : new Date(),
        expiresAt: null,
        sourceData: {
          platform: 'freelancer',
          budget_minimum: budgetMin,
          budget_maximum: budgetMax,
          currency: project.currency?.code || 'USD',
          bid_count: project.bid_stats?.bid_count || 0,
          client_rating: project.owner?.employer_reputation?.entire_history?.overall || null,
          client_reviews: project.owner?.employer_reputation?.entire_history?.reviews || 0,
          skills,
          time_submitted: project.time_submitted,
          type: project.type || 'fixed',
        },
      };
    });
  }
}

module.exports = FreelancerApiAdapter;
