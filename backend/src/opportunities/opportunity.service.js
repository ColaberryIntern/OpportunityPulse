const { Op, fn, col, literal } = require('sequelize');
const { Opportunity, DataSource } = require('../models');
const { OPPORTUNITY_STATUS } = require('../config/constants');
const { parsePagination } = require('../utils/pagination');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * List opportunities with filtering, search, pagination, and sorting.
 */
async function listOpportunities({
  type,
  category,
  status,
  tags,
  q,
  dateFrom,
  dateTo,
  minScore,
  sort,
  page,
  limit,
  actionType,
} = {}) {
  const { page: safePage, limit: safeLimit, offset } = parsePagination({ page, limit });

  // Build where clause
  const where = {};

  // Exact filters
  if (type) where.type = type;
  if (category) where.category = category;
  where.status = status || OPPORTUNITY_STATUS.ACTIVE;

  // Action type filter
  if (actionType) where.actionType = actionType;

  // Tags filter (overlap -- opportunity has any of the provided tags)
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      where.tags = { [Op.overlap]: tagList };
    }
  }

  // Keyword search on title and description (case-insensitive)
  if (q && q.trim()) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${q.trim()}%` } },
      { description: { [Op.iLike]: `%${q.trim()}%` } },
    ];
  }

  // Date range filter on publishedAt
  if (dateFrom || dateTo) {
    const dateCondition = {};
    let hasDateFilter = false;
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) {
        dateCondition[Op.gte] = from;
        hasDateFilter = true;
      }
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        dateCondition[Op.lte] = to;
        hasDateFilter = true;
      }
    }
    if (hasDateFilter) {
      where.publishedAt = dateCondition;
    }
  }

  // Minimum AI score filter
  if (minScore !== undefined && minScore !== null && minScore !== '') {
    const score = parseFloat(minScore);
    if (!isNaN(score)) {
      where.aiScore = { [Op.gte]: score };
    }
  }

  // Sort order
  let order;
  switch (sort) {
    case 'oldest':
      order = [['published_at', 'ASC']];
      break;
    case 'score':
      order = [['ai_score', 'DESC NULLS LAST']];
      break;
    case 'value':
      order = [[literal('"Opportunity"."value" DESC NULLS LAST')]];
      break;
    default:
      // 'newest' or no sort specified
      order = [['published_at', 'DESC']];
      break;
  }

  const { rows: results, count: total } = await Opportunity.findAndCountAll({
    where,
    include: [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }],
    order,
    limit: safeLimit,
    offset,
  });

  // Build filters echo for response
  const filters = {};
  if (type) filters.type = type;
  if (category) filters.category = category;
  if (status) filters.status = status;
  if (tags) filters.tags = tags;
  if (q) filters.q = q;
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  if (minScore !== undefined && minScore !== null && minScore !== '') filters.minScore = minScore;
  if (sort) filters.sort = sort;
  if (actionType) filters.actionType = actionType;

  return {
    results,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
    filters,
  };
}

/**
 * Get a single opportunity by ID.
 */
async function getOpportunityById(id) {
  const opportunity = await Opportunity.findByPk(id, {
    include: [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }],
  });

  if (!opportunity) {
    throw new AppError('Opportunity not found.', 404);
  }

  return opportunity;
}

/**
 * Get aggregated opportunity statistics.
 */
async function getOpportunityStats() {
  const [
    totalCount,
    govContractCount,
    aiJobCount,
    investmentCount,
    statusCounts,
    avgScoreResult,
    totalValueResult,
    recentCount,
  ] = await Promise.all([
    // Total count
    Opportunity.count(),
    // Count by type
    Opportunity.count({ where: { type: 'gov_contract' } }),
    Opportunity.count({ where: { type: 'ai_job' } }),
    Opportunity.count({ where: { type: 'investment' } }),
    // Count by status (grouped)
    Opportunity.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
    // Average AI score (excluding nulls)
    Opportunity.findOne({
      attributes: [[fn('AVG', col('ai_score')), 'avgScore']],
      where: { aiScore: { [Op.ne]: null } },
      raw: true,
    }),
    // Total value (excluding nulls)
    Opportunity.findOne({
      attributes: [[fn('SUM', col('value')), 'totalValue']],
      where: { value: { [Op.ne]: null } },
      raw: true,
    }),
    // Count added in last 7 days
    Opportunity.count({
      where: {
        createdAt: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  // Convert status counts array to object
  const byStatus = {};
  statusCounts.forEach((row) => {
    byStatus[row.status] = parseInt(row.count, 10);
  });

  return {
    total: totalCount,
    byType: {
      gov_contract: govContractCount,
      ai_job: aiJobCount,
      investment: investmentCount,
    },
    byStatus,
    averageAiScore: avgScoreResult?.avgScore
      ? parseFloat(parseFloat(avgScoreResult.avgScore).toFixed(2))
      : null,
    totalValue: totalValueResult?.totalValue
      ? parseFloat(totalValueResult.totalValue)
      : null,
    addedLast7Days: recentCount,
  };
}

module.exports = {
  listOpportunities,
  getOpportunityById,
  getOpportunityStats,
  AppError,
};
