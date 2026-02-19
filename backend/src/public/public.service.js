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

module.exports = {
  listPublicOpportunities,
  getPublicOpportunity,
  getPublicStats,
  AppError,
};
