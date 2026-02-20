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
    const { type, category, since, limit, page } = req.query;

    // If-Modified-Since support: return 304 if no new data
    if (req.headers['if-modified-since']) {
      const { Opportunity } = require('../models');
      const clientDate = new Date(req.headers['if-modified-since']);
      const latestUpdate = await Opportunity.max('updated_at', { where: { status: 'active' } });
      if (latestUpdate && new Date(latestUpdate) <= clientDate) {
        return res.status(304).end();
      }
    }

    const result = await publicService.listFeedOpportunities({ type, category, since, limit, page });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    const siteUrl = `${frontendUrl}/opportunities`;

    const TYPE_LABELS = {
      gov_contract: 'Government Contract', ai_job: 'AI Job', investment: 'Investment',
      grant: 'Grant', ai_news: 'AI News', freelance: 'Freelance',
    };

    // Map raw types to strategic navigation groups
    const TYPE_TO_GROUP = {
      gov_contract: 'Government', grant: 'Government',
      ai_news: 'Private Sector',
      ai_job: 'Talent',
      investment: 'Capital',
      freelance: 'Freelance',
    };

    // Build self URL preserving query params
    const selfParams = new URLSearchParams();
    if (type) selfParams.set('type', type);
    if (category) selfParams.set('category', category);
    if (since) selfParams.set('since', since);
    if (limit) selfParams.set('limit', limit);
    if (page) selfParams.set('page', page);
    const selfUrl = `${apiUrl}/api/v1/public/opportunities/feed.xml${selfParams.toString() ? '?' + selfParams.toString() : ''}`;

    const feed = new RSS({
      title: 'Opportunity Pulse',
      description: 'Latest opportunities — government contracts, AI jobs, investments, grants, AI news, and freelance projects',
      feed_url: selfUrl,
      site_url: siteUrl,
      language: 'en',
      pubDate: result.opportunities.length > 0
        ? new Date(result.opportunities[0].publishedAt || result.opportunities[0].createdAt)
        : new Date(),
      ttl: 5,
      custom_namespaces: { op: 'https://opportunitypulse.ai/rss/1.0' },
      custom_elements: [
        { 'op:totalItems': result.total },
        { 'op:currentPage': result.pagination.page },
        { 'op:totalPages': result.pagination.pages },
        { 'op:hasMore': result.pagination.hasMore },
      ],
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
      const group = TYPE_TO_GROUP[opp.type];
      if (group) categories.push(group);

      // Custom elements for strategic intelligence
      const custom_elements = [];
      if (group) custom_elements.push({ 'op:strategicGroup': group });
      if (opp.aiScore != null) custom_elements.push({ 'op:aiScore': opp.aiScore });
      if (opp.opportunityQuadrant) custom_elements.push({ 'op:quadrant': opp.opportunityQuadrant });
      const cluster = opp.classification?.cluster;
      if (cluster) {
        custom_elements.push({ 'op:cluster': cluster.name });
        custom_elements.push({ 'op:clusterSlug': cluster.slug });
      }
      const saturation = opp.classification?.saturationIndex;
      if (saturation != null) custom_elements.push({ 'op:saturationIndex': saturation });

      feed.item({
        title: opp.title,
        url: link,
        guid: oppUrl,
        description: desc,
        date: new Date(opp.publishedAt || opp.createdAt),
        categories,
        custom_elements,
      });
    }

    // Compute Last-Modified from the newest item
    const lastModified = result.opportunities.length > 0
      ? new Date(result.opportunities[0].updatedAt || result.opportunities[0].createdAt)
      : new Date();

    const xml = feed.xml({ indent: true });
    res
      .set('Last-Modified', lastModified.toUTCString())
      .set('Cache-Control', 'public, max-age=300')
      .set('X-Total-Count', String(result.total))
      .set('X-Page', String(result.pagination.page))
      .set('X-Total-Pages', String(result.pagination.pages))
      .type('application/rss+xml')
      .send(xml);
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
