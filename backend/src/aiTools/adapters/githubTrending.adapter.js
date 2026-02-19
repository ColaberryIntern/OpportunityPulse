const logger = require('../../logging/logger');

const GITHUB_API = 'https://api.github.com';

/**
 * Fetch trending AI/ML repositories from GitHub using the search API.
 *
 * Searches across multiple AI-related topics for repositories with
 * significant star counts. Deduplicates results by sourceId.
 *
 * Optionally uses the GITHUB_TOKEN environment variable for higher
 * rate limits (unauthenticated: 10 requests/min, authenticated: 30/min).
 *
 * @returns {Array<{name: string, fullName: string, description: string, website: string, vendor: string, source: string, sourceId: string, sourceUrl: string, stars: number, language: string, topics: string[], updatedAt: string}>}
 */
async function fetchGithubTrendingAiTools() {
  try {
    // Search queries targeting different AI/ML topic areas
    // The '+' acts as a space separator in GitHub's search syntax
    const queries = [
      'topic:artificial-intelligence stars:>100',
      'topic:machine-learning stars:>100',
      'topic:llm stars:>50',
      'topic:generative-ai stars:>50',
    ];

    const allRepos = [];
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpportunityPulse/1.0',
    };

    // Add authentication token if available for higher rate limits
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    for (const q of queries) {
      try {
        const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;
        const response = await fetch(url, { headers });

        if (!response.ok) {
          logger.warn('GitHub API error', { status: response.status, query: q });
          continue;
        }

        const data = await response.json();
        for (const repo of (data.items || [])) {
          allRepos.push({
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description || '',
            website: repo.homepage || repo.html_url,
            vendor: repo.owner?.login || 'Unknown',
            source: 'github',
            sourceId: `gh_${repo.id}`,
            sourceUrl: repo.html_url,
            stars: repo.stargazers_count,
            language: repo.language,
            topics: repo.topics || [],
            updatedAt: repo.pushed_at,
          });
        }

        // Respect GitHub API rate limits — pause 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (queryErr) {
        logger.warn('GitHub query error', { query: q, error: queryErr.message });
      }
    }

    // Deduplicate by sourceId (repos can appear in multiple topic searches)
    const seen = new Set();
    return allRepos.filter(r => {
      if (seen.has(r.sourceId)) return false;
      seen.add(r.sourceId);
      return true;
    });
  } catch (error) {
    logger.error('GitHub trending fetch error', { error: error.message });
    return [];
  }
}

module.exports = { fetchGithubTrendingAiTools };
