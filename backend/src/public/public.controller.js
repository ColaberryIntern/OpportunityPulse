const RSS = require('rss');
const publicService = require('./public.service');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');

async function listOpportunities(req, res, next) {
  try {
    const { type, category, page, limit } = req.query;
    const result = await publicService.listPublicOpportunities({ type, category, page, limit });

    return paginatedResponse(
      res,
      result.opportunities,
      result.pagination,
      'Public opportunities retrieved.'
    );
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function getOpportunity(req, res, next) {
  try {
    const opportunity = await publicService.getPublicOpportunity(req.params.id);
    return successResponse(res, { opportunity }, 'Opportunity retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function getStats(req, res, next) {
  try {
    const stats = await publicService.getPublicStats();
    return successResponse(res, { stats }, 'Public opportunity statistics retrieved.');
  } catch (error) {
    next(error);
  }
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

async function getFeed(req, res, next) {
  try {
    const { type, category } = req.query;
    const result = await publicService.listPublicOpportunities({ type, category, limit: 50 });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    const siteUrl = `${frontendUrl}/opportunities`;

    const TYPE_LABELS = {
      gov_contract: 'Government Contract', ai_job: 'AI Job', investment: 'Investment',
      grant: 'Grant', ai_news: 'AI News',
    };

    const feed = new RSS({
      title: 'Opportunity Pulse',
      description: 'Latest opportunities — government contracts, AI jobs, investments, grants, and AI news',
      feed_url: `${apiUrl}/api/v1/public/opportunities/feed.xml`,
      site_url: siteUrl,
      language: 'en',
      pubDate: result.opportunities.length > 0
        ? new Date(result.opportunities[0].publishedAt || result.opportunities[0].createdAt)
        : new Date(),
      ttl: 5,
    });

    for (const opp of result.opportunities) {
      const oppUrl = `${frontendUrl}/opportunities/${opp.id}`;
      const link = isValidUrl(opp.sourceUrl) ? opp.sourceUrl : oppUrl;
      const desc = opp.description
        ? opp.description.length > 500 ? opp.description.slice(0, 497) + '...' : opp.description
        : opp.title;

      const categories = [];
      if (opp.type) categories.push(TYPE_LABELS[opp.type] || opp.type);
      if (opp.category) categories.push(opp.category);

      feed.item({
        title: opp.title,
        url: link,
        guid: oppUrl,
        description: desc,
        date: new Date(opp.publishedAt || opp.createdAt),
        categories,
      });
    }

    res.type('application/rss+xml').send(feed.xml({ indent: true }));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listOpportunities,
  getOpportunity,
  getStats,
  getFeed,
};
