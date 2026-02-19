const { Op } = require('sequelize');
const { Opportunity } = require('../models');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

// Fields to exclude from public responses (premium data)
const EXCLUDED_FIELDS = ['aiScore', 'aiAnalysis', 'sourceData'];

// Public max page size
const PUBLIC_MAX_LIMIT = 50;

// Feed max page size (higher for export/sync)
const FEED_MAX_LIMIT = 5000;
const FEED_DEFAULT_LIMIT = 50;

async function listPublicOpportunities({ type, category, page, limit } = {}) {
  // Enforce max 20/page
  const requestedLimit = parseInt(limit, 10) || 20;
  const safeLimit = Math.min(requestedLimit, PUBLIC_MAX_LIMIT);
  const { page: safePage, offset } = parsePagination({ page, limit: safeLimit });

  const where = { status: 'active' };
  if (type) where.type = type;
  if (category) where.category = category;

  const { rows: opportunities, count: total } = await Opportunity.findAndCountAll({
    where,
    attributes: { exclude: EXCLUDED_FIELDS },
    order: [['published_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    opportunities,
    pagination: buildPaginationMeta(total, safePage, safeLimit),
  };
}

async function getPublicOpportunity(id) {
  const opportunity = await Opportunity.findOne({
    where: { id, status: 'active' },
    attributes: { exclude: EXCLUDED_FIELDS },
  });

  if (!opportunity) {
    throw new AppError('Opportunity not found.', 404);
  }

  return opportunity;
}

async function getPublicStats() {
  const [total, govContractCount, aiJobCount, investmentCount] = await Promise.all([
    Opportunity.count({ where: { status: 'active' } }),
    Opportunity.count({ where: { status: 'active', type: 'gov_contract' } }),
    Opportunity.count({ where: { status: 'active', type: 'ai_job' } }),
    Opportunity.count({ where: { status: 'active', type: 'investment' } }),
  ]);

  return {
    totalActive: total,
    byType: {
      gov_contract: govContractCount,
      ai_job: aiJobCount,
      investment: investmentCount,
    },
  };
}

async function listFeedOpportunities({ type, category, since, page, limit } = {}) {
  const requestedLimit = parseInt(limit, 10) || FEED_DEFAULT_LIMIT;
  const safeLimit = Math.min(requestedLimit, FEED_MAX_LIMIT);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = { status: 'active' };
  if (type) where.type = type;
  if (category) where.category = category;
  if (since) {
    where.createdAt = { [Op.gt]: new Date(since) };
  }

  const { rows: opportunities, count: total } = await Opportunity.findAndCountAll({
    where,
    attributes: { exclude: EXCLUDED_FIELDS },
    order: [['published_at', 'DESC'], ['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    opportunities,
    total,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
      hasMore: offset + opportunities.length < total,
    },
  };
}

module.exports = {
  listPublicOpportunities,
  listFeedOpportunities,
  getPublicOpportunity,
  getPublicStats,
  AppError,
};
