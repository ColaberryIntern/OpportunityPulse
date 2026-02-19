const logger = require('../../logging/logger');

const PRODUCT_HUNT_API = 'https://api.producthunt.com/v2/api/graphql';

/**
 * Fetch trending AI tools from Product Hunt using their GraphQL API.
 *
 * Requires the PRODUCT_HUNT_TOKEN environment variable to be set.
 * If the token is not configured, returns an empty array gracefully
 * so the rest of the system continues operating without this adapter.
 *
 * @returns {Array<{name: string, description: string, website: string, vendor: string, source: string, sourceId: string, sourceUrl: string, votesCount: number, createdAt: string, topics: string[]}>}
 */
async function fetchProductHuntAiTools() {
  const token = process.env.PRODUCT_HUNT_TOKEN;
  if (!token) {
    logger.info('Product Hunt token not configured, skipping adapter');
    return [];
  }

  try {
    const query = `
      query {
        posts(order: RANKING, topic: "artificial-intelligence", first: 20) {
          edges {
            node {
              id
              name
              tagline
              description
              url
              website
              votesCount
              createdAt
              topics {
                edges {
                  node {
                    name
                  }
                }
              }
              makers {
                name
              }
            }
          }
        }
      }
    `;

    const response = await fetch(PRODUCT_HUNT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      logger.warn('Product Hunt API error', { status: response.status });
      return [];
    }

    const data = await response.json();
    const posts = data?.data?.posts?.edges || [];

    return posts.map(({ node }) => ({
      name: node.name,
      description: node.tagline || node.description || '',
      website: node.website || node.url,
      vendor: node.makers?.[0]?.name || 'Unknown',
      source: 'product_hunt',
      sourceId: `ph_${node.id}`,
      sourceUrl: node.url,
      votesCount: node.votesCount,
      createdAt: node.createdAt,
      topics: (node.topics?.edges || []).map(e => e.node.name),
    }));
  } catch (error) {
    logger.error('Product Hunt fetch error', { error: error.message });
    return [];
  }
}

module.exports = { fetchProductHuntAiTools };
