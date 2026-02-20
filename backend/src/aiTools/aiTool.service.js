const { Op, fn, col, literal } = require('sequelize');
const { AiTool, AiToolMention, Opportunity } = require('../models');
const logger = require('../logging/logger');

/**
 * Generate a URL-safe slug from a tool name.
 * @param {string} name
 * @returns {string}
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * List AI tools with optional filters, search, and pagination.
 */
async function listAiTools({ category, industry, q, trendDirection, sort, page = 1, limit = 20 } = {}) {
  const where = {};

  if (category) {
    where.category = category;
  }

  if (industry) {
    where.industries = { [Op.contains]: [industry] };
  }

  if (q) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${q}%` } },
      { description: { [Op.iLike]: `%${q}%` } },
    ];
  }

  if (trendDirection) {
    where.trendDirection = trendDirection;
  }

  // Determine sort order
  let order;
  switch (sort) {
    case 'updated':
      order = [['last_major_update', 'DESC NULLS LAST']];
      break;
    case 'name':
      order = [['name', 'ASC']];
      break;
    case 'newest':
      order = [['created_at', 'DESC']];
      break;
    case 'trending':
    default:
      order = [['trending_score', 'DESC']];
      break;
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await AiTool.findAndCountAll({
    where,
    order,
    limit,
    offset,
  });

  return {
    tools: rows,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

/**
 * Get a single AI tool by its slug, including recent mentions.
 */
async function getAiToolBySlug(slug) {
  const tool = await AiTool.findOne({
    where: { slug },
    include: [
      {
        model: AiToolMention,
        as: 'mentions',
        limit: 10,
        order: [['mentioned_at', 'DESC']],
      },
    ],
  });

  if (!tool) {
    const error = new Error('AI tool not found.');
    error.statusCode = 404;
    throw error;
  }

  return tool;
}

/**
 * Get a single AI tool by its primary key.
 */
async function getAiToolById(id) {
  return AiTool.findByPk(id);
}

/**
 * Get the top trending AI tools with optional filters.
 */
async function getTopTrendingTools({ limit = 5, industry, category } = {}) {
  const where = { status: 'active' };

  if (industry) {
    where.industries = { [Op.contains]: [industry] };
  }

  if (category) {
    where.category = category;
  }

  return AiTool.findAll({
    where,
    order: [['trending_score', 'DESC']],
    limit,
  });
}

/**
 * Get aggregate statistics about AI tools in the system.
 */
async function getAiToolStats() {
  const totalTools = await AiTool.count({ where: { status: 'active' } });

  // Count by category
  const byCategoryRaw = await AiTool.findAll({
    where: { status: 'active' },
    attributes: ['category', [fn('COUNT', col('id')), 'count']],
    group: ['category'],
    raw: true,
  });
  const byCategory = {};
  byCategoryRaw.forEach((row) => {
    byCategory[row.category] = parseInt(row.count, 10);
  });

  // Count by industry (unnest the array)
  let byIndustry = {};
  try {
    const byIndustryRaw = await AiTool.sequelize.query(
      `SELECT unnest(industries) AS industry, COUNT(*) AS count
       FROM ai_tools
       WHERE status = 'active'
       GROUP BY industry
       ORDER BY count DESC`,
      { type: AiTool.sequelize.QueryTypes.SELECT }
    );
    byIndustryRaw.forEach((row) => {
      byIndustry[row.industry] = parseInt(row.count, 10);
    });
  } catch (err) {
    logger.warn('Failed to compute industry stats', { error: err.message });
  }

  // Average trending score
  const avgResult = await AiTool.findOne({
    where: { status: 'active' },
    attributes: [[fn('AVG', col('trending_score')), 'avgScore']],
    raw: true,
  });
  const avgTrendingScore = avgResult?.avgScore ? parseFloat(parseFloat(avgResult.avgScore).toFixed(2)) : 0;

  // Rising count
  const risingCount = await AiTool.count({
    where: { status: 'active', trendDirection: 'rising' },
  });

  // Top 3 trending
  const topTrending = await AiTool.findAll({
    where: { status: 'active' },
    order: [['trending_score', 'DESC']],
    limit: 3,
    attributes: ['id', 'name', 'slug', 'category', 'trendingScore', 'trendDirection'],
  });

  return {
    totalTools,
    byCategory,
    byIndustry,
    avgTrendingScore,
    risingCount,
    topTrending,
  };
}

/**
 * Get tools relevant to a specific industry.
 */
async function getToolsByIndustry(industry) {
  return AiTool.findAll({
    where: {
      industries: { [Op.contains]: [industry] },
      status: 'active',
    },
    order: [['trending_score', 'DESC']],
    limit: 20,
  });
}

/**
 * Create a new AI tool record.
 */
async function createAiTool(data) {
  const slug = data.slug || generateSlug(data.name);
  const tool = await AiTool.create({ ...data, slug });
  logger.info('AI tool created', { id: tool.id, name: tool.name, slug: tool.slug });
  return tool;
}

/**
 * Update an existing AI tool by ID.
 */
async function updateAiTool(id, data) {
  const tool = await AiTool.findByPk(id);

  if (!tool) {
    const error = new Error('AI tool not found.');
    error.statusCode = 404;
    throw error;
  }

  // Update allowed fields
  const allowedFields = [
    'name', 'description', 'website', 'logoUrl', 'vendor', 'category',
    'subcategory', 'industries', 'tags', 'trendingScore', 'mentionCount7d',
    'sentimentScore', 'trendDirection', 'lastMajorUpdate', 'lastMajorUpdateSummary',
    'updateHistory', 'pricingTier', 'pricingDetails', 'features', 'aiAnalysis',
    'sourceData', 'status', 'lastAnalyzedAt',
  ];

  allowedFields.forEach((field) => {
    if (data[field] !== undefined) {
      tool[field] = data[field];
    }
  });

  await tool.save();
  logger.info('AI tool updated', { id: tool.id, name: tool.name });
  return tool;
}

/**
 * Bulk upsert tools by slug.
 * Creates new tools or updates trending fields for existing ones.
 */
async function bulkUpsertTools(tools) {
  let created = 0;
  let updated = 0;

  for (const toolData of tools) {
    const slug = toolData.slug || generateSlug(toolData.name);
    const [tool, wasCreated] = await AiTool.findOrCreate({
      where: { slug },
      defaults: { ...toolData, slug },
    });

    if (wasCreated) {
      created++;
    } else {
      // Update trending-related fields on existing records
      const trendFields = ['trendingScore', 'mentionCount7d', 'sentimentScore', 'trendDirection', 'lastAnalyzedAt'];
      let hasChanges = false;

      trendFields.forEach((field) => {
        if (toolData[field] !== undefined) {
          tool[field] = toolData[field];
          hasChanges = true;
        }
      });

      if (hasChanges) {
        await tool.save();
      }
      updated++;
    }
  }

  logger.info('Bulk upsert completed', { created, updated });
  return { created, updated };
}

/**
 * Create a new mention record for an AI tool.
 */
async function createMention(data) {
  const mention = await AiToolMention.create(data);
  logger.info('AI tool mention created', { id: mention.id, aiToolId: mention.aiToolId });
  return mention;
}

/**
 * Get paginated mentions for a specific AI tool.
 */
async function getMentionsForTool(toolId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;

  const { count, rows } = await AiToolMention.findAndCountAll({
    where: { aiToolId: toolId },
    order: [['mentioned_at', 'DESC']],
    limit,
    offset,
  });

  return {
    mentions: rows,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

/**
 * Get top tools ranked by composite momentum score.
 */
async function getMomentumTools({ stage, minMomentum, category, limit = 10 } = {}) {
  const where = { status: 'active' };

  if (stage) {
    where.momentumStage = stage;
  }

  if (minMomentum) {
    where.compositeMomentumScore = { [Op.gte]: parseFloat(minMomentum) };
  }

  if (category) {
    where.category = category;
  }

  const { AiCapability } = require('../models');

  const tools = await AiTool.findAll({
    where,
    order: [['composite_momentum_score', 'DESC']],
    limit: parseInt(limit, 10),
    include: [{
      model: AiCapability,
      as: 'capability',
      attributes: ['slug', 'name'],
      required: false,
    }],
  });

  return tools;
}

module.exports = {
  generateSlug,
  listAiTools,
  getAiToolBySlug,
  getAiToolById,
  getTopTrendingTools,
  getAiToolStats,
  getToolsByIndustry,
  createAiTool,
  updateAiTool,
  bulkUpsertTools,
  createMention,
  getMentionsForTool,
  getMomentumTools,
};
