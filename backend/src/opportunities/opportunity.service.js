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

// An undated opportunity counts as open for this many days after it was
// posted. Many SAM.gov notices (sources sought, special notices) carry no
// response deadline; without a window they would stay "open" forever.
const UNDATED_OPEN_WINDOW_DAYS = 30;

function splitList(value) {
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Build the `source` column condition from an include list and an exclude
 * list (both comma-separated). `rss_enriched` is not a source key — it is a
 * legacy flag handled separately — so it is ignored here.
 * @returns {object|string|null} Sequelize condition, or null for no filter.
 */
function buildSourceCondition(source, excludeSource) {
  const include = source ? splitList(source).filter((s) => s !== 'rss_enriched') : [];
  const exclude = excludeSource ? splitList(excludeSource) : [];
  if (include.length === 0 && exclude.length === 0) return null;
  if (include.length === 1 && exclude.length === 0) return include[0];
  const condition = {};
  if (include.length) condition[Op.in] = include;
  if (exclude.length) condition[Op.notIn] = exclude;
  return condition;
}

// SAM.gov notice types that announce a decision rather than invite a
// response (award, sole-source justification, bundling, surplus sale). They
// carry no deadline, so the undated window alone would list them as open —
// 380 rows in production on 2026-09-18. Both SAM feeds store the type:
// the API in source_data.type, the scraper in source_data.noticeType.
// Static SQL (no user input).
const NOT_A_SOLICITATION = literal(
  "COALESCE(\"Opportunity\".\"source_data\"->>'type', \"Opportunity\".\"source_data\"->>'noticeType', '') "
  + "!~* '^(award|justification|consolidate|intent to bundle|sale of surplus)'",
);

/**
 * "Still open": the deadline is in the future, or there is no deadline and
 * the notice was posted within UNDATED_OPEN_WINDOW_DAYS. `status` alone is
 * not enough — most "active" SAM.gov rows have a response deadline that has
 * already passed.
 */
function buildOpenOnlyCondition(now = new Date()) {
  const undatedCutoff = new Date(now.getTime() - UNDATED_OPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    [Op.or]: [
      { expiresAt: { [Op.gte]: now } },
      { expiresAt: null, publishedAt: { [Op.gte]: undatedCutoff } },
    ],
  };
}

/** Everything openOnly=true adds to the query: still open, and invites a response. */
function buildOpenOnlyConditions(now = new Date()) {
  return [buildOpenOnlyCondition(now), NOT_A_SOLICITATION];
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
  source,
  excludeSource,
  openOnly,
  now = new Date(),
} = {}) {
  const { page: safePage, limit: safeLimit, offset } = parsePagination({ page, limit });

  // Build where clause
  const where = {};

  // Type filter (supports comma-separated for multi-type strategic views)
  if (type) {
    const types = type.split(',').map(t => t.trim()).filter(Boolean);
    where.type = types.length === 1 ? types[0] : { [Op.in]: types };
  }
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

  // Source filter: rss_enriched = only opportunities with rssSignals data
  if (source === 'rss_enriched') {
    where.aiAnalysis = { rssSignals: { [Op.ne]: null } };
  }
  const sourceCondition = buildSourceCondition(source, excludeSource);
  if (sourceCondition !== null) where.source = sourceCondition;

  // Wrapped in Op.and so it cannot collide with the keyword search's Op.or.
  if (openOnly === true || openOnly === 'true') {
    where[Op.and] = buildOpenOnlyConditions(now);
  }

  // Sort order
  let order;
  switch (sort) {
    case 'oldest':
      order = [['published_at', 'ASC']];
      break;
    case 'deadline':
      // Soonest deadline first; undated rows last, newest of those first.
      order = [
        [literal('"Opportunity"."expires_at" ASC NULLS LAST')],
        ['published_at', 'DESC'],
      ];
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
      include: [
        { model: StrategicCluster, as: 'cluster', attributes: ['slug', 'name'], required: false },
      ],
    });
  } else {
    // Always include lightweight classification for cluster badge display
    include.push({
      model: OpportunityClassification,
      as: 'classification',
      required: false,
      attributes: ['clusterId'],
      include: [
        { model: StrategicCluster, as: 'cluster', attributes: ['slug', 'name'], required: false },
      ],
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
  if (source) filters.source = source;
  if (excludeSource) filters.excludeSource = excludeSource;
  if (openOnly === true || openOnly === 'true') filters.openOnly = true;

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
  buildSourceCondition,
  buildOpenOnlyCondition,
  buildOpenOnlyConditions,
  NOT_A_SOLICITATION,
  UNDATED_OPEN_WINDOW_DAYS,
};
