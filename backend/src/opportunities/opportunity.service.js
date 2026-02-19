const { Op, fn, col, literal } = require('sequelize');
const { Opportunity, DataSource, OpportunityClassification, AiDomain, AiCapability, StrategicIntent, MonetizationAngle, MaturityPhase, GeographicTag, StrategicCluster } = require('../models');
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
  domain,
  capability,
  intent,
  monetization,
  maturity,
  geo,
  quadrant,
  cluster,
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

  // Build includes array
  const include = [{ model: DataSource, as: 'dataSource', attributes: ['name', 'type'] }];

  // Multi-dimensional classification filters
  const hasDimensionalFilter = domain || capability || intent || monetization || maturity || geo || quadrant || cluster;
  if (hasDimensionalFilter) {
    const classificationWhere = {};
    if (domain) {
      const domainRow = await AiDomain.findOne({ where: { slug: domain } });
      if (domainRow) classificationWhere.domainId = domainRow.id;
    }
    if (capability) {
      const capRow = await AiCapability.findOne({ where: { slug: capability } });
      if (capRow) classificationWhere.capabilityId = capRow.id;
    }
    if (intent) {
      const intentRow = await StrategicIntent.findOne({ where: { slug: intent } });
      if (intentRow) classificationWhere.strategicIntentId = intentRow.id;
    }
    if (monetization) {
      const monetRow = await MonetizationAngle.findOne({ where: { slug: monetization } });
      if (monetRow) classificationWhere.monetizationAngleId = monetRow.id;
    }
    if (maturity) {
      const matRow = await MaturityPhase.findOne({ where: { slug: maturity } });
      if (matRow) classificationWhere.maturityPhaseId = matRow.id;
    }
    if (geo) {
      const geoRow = await GeographicTag.findOne({ where: { slug: geo } });
      if (geoRow) classificationWhere.geographicTagId = geoRow.id;
    }
    if (cluster) {
      classificationWhere.clusterId = parseInt(cluster, 10);
    }

    include.push({
      model: OpportunityClassification,
      as: 'classification',
      where: classificationWhere,
      required: true,
      attributes: ['domainId', 'capabilityId', 'strategicIntentId', 'monetizationAngleId', 'maturityPhaseId', 'geographicTagId', 'clusterId', 'demandScore', 'competitionScore', 'saturationIndex'],
    });
  }

  // Quadrant filter (on the Opportunity table itself)
  if (quadrant) {
    const quadrantLabels = {
      HD_LC: 'High Demand / Low Competition',
      HD_HC: 'High Demand / High Competition',
      LD_LC: 'Low Demand / Low Competition',
      LD_HC: 'Low Demand / High Competition',
    };
    if (quadrantLabels[quadrant]) {
      where.opportunityQuadrant = quadrantLabels[quadrant];
    }
  }

  const { rows: results, count: total } = await Opportunity.findAndCountAll({
    where,
    include,
    order,
    limit: safeLimit,
    offset,
    distinct: true,
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
  if (domain) filters.domain = domain;
  if (capability) filters.capability = capability;
  if (intent) filters.intent = intent;
  if (monetization) filters.monetization = monetization;
  if (maturity) filters.maturity = maturity;
  if (geo) filters.geo = geo;
  if (quadrant) filters.quadrant = quadrant;
  if (cluster) filters.cluster = cluster;

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
    include: [
      { model: DataSource, as: 'dataSource', attributes: ['name', 'type'] },
      {
        model: OpportunityClassification,
        as: 'classification',
        required: false,
        include: [
          { model: AiDomain, as: 'domain', attributes: ['slug', 'name'] },
          { model: AiCapability, as: 'capability', attributes: ['slug', 'name'] },
          { model: StrategicIntent, as: 'strategicIntent', attributes: ['slug', 'name'] },
          { model: MonetizationAngle, as: 'monetizationAngle', attributes: ['slug', 'name'] },
          { model: MaturityPhase, as: 'maturityPhase', attributes: ['slug', 'name'] },
          { model: GeographicTag, as: 'geographicTag', attributes: ['slug', 'name'] },
          { model: StrategicCluster, as: 'cluster', attributes: ['slug', 'name'] },
        ],
      },
    ],
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
