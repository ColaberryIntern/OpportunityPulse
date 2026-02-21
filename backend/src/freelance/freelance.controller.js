const { Op } = require('sequelize');
const { Opportunity, DataSource } = require('../models');
const { getTrendingSkills, getSkillTrend, getDemandHeatmap, generateDailySnapshot } = require('./freelanceTrend.service');
const { generateFreelanceAction } = require('./freelanceAction.service');
const { classifyFreelanceOpportunities } = require('./freelanceClassification.service');
const { scoreFreelanceOpportunities } = require('./freelanceScoring.service');
const { runIngestion } = require('../ingestion/ingestion.service');
const { PAGINATION } = require('../config/constants');
const logger = require('../logging/logger');

/**
 * GET /api/v1/freelance/opportunities
 * List freelance opportunities with filters.
 */
async function listOpportunities(req, res, next) {
  try {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sort = 'score',
      skills,
      minBudget,
      maxBudget,
      platform,
      complexity,
      minScore,
      status = 'active',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const offset = (pageNum - 1) * limitNum;

    const where = { type: 'freelance' };

    if (status) where.status = status;
    if (minScore) where.aiScore = { [Op.gte]: parseFloat(minScore) };
    if (minBudget || maxBudget) {
      where.value = {};
      if (minBudget) where.value[Op.gte] = parseFloat(minBudget);
      if (maxBudget) where.value[Op.lte] = parseFloat(maxBudget);
    }
    if (platform) {
      where.source = platform;
    }
    if (skills) {
      const skillList = skills.split(',').map((s) => s.trim());
      where.tags = { [Op.overlap]: skillList };
    }
    if (complexity) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        { aiAnalysis: { complexity } },
      ];
    }

    // Sort options
    let order;
    switch (sort) {
      case 'score':
        order = [['ai_score', 'DESC NULLS LAST']];
        break;
      case 'budget':
        order = [['value', 'DESC NULLS LAST']];
        break;
      case 'newest':
        order = [['created_at', 'DESC']];
        break;
      case 'competition':
        order = [['created_at', 'DESC']]; // Fall back; competition is in JSONB
        break;
      default:
        order = [['ai_score', 'DESC NULLS LAST']];
    }

    const { rows, count } = await Opportunity.findAndCountAll({
      where,
      order,
      limit: limitNum,
      offset,
    });

    res.json({
      opportunities: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/freelance/opportunities/:id
 * Get a single freelance opportunity.
 */
async function getOpportunity(req, res, next) {
  try {
    const opportunity = await Opportunity.findOne({
      where: { id: req.params.id, type: 'freelance' },
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Freelance opportunity not found' });
    }

    res.json(opportunity);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/freelance/trends
 * Get trending skills and demand data.
 */
async function getTrends(req, res, next) {
  try {
    const { days = 30 } = req.query;
    const trending = await getTrendingSkills(parseInt(days, 10));
    const heatmap = await getDemandHeatmap(parseInt(days, 10));

    res.json({ trending, heatmap });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/freelance/trends/:skill
 * Get trend time series for a specific skill.
 */
async function getSkillTrendData(req, res, next) {
  try {
    const { days = 30 } = req.query;
    const trend = await getSkillTrend(req.params.skill, parseInt(days, 10));

    res.json({ skill: req.params.skill, trend });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/freelance/actions/:id/generate
 * Generate action content for a freelance opportunity.
 */
async function generateAction(req, res, next) {
  try {
    const { actionType } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: 'actionType is required (PROPOSAL, ARCHITECTURE, SOW, SAAS_IDEA, OUTREACH)' });
    }

    const opportunity = await Opportunity.findOne({
      where: { id: req.params.id, type: 'freelance' },
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Freelance opportunity not found' });
    }

    const userProfile = req.user?.profileData || null;
    const result = await generateFreelanceAction(actionType, opportunity, userProfile);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/freelance/import
 * Manual LinkedIn import endpoint.
 */
async function importProjects(req, res, next) {
  try {
    const { projects } = req.body;

    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return res.status(400).json({ error: 'projects array is required' });
    }

    // Update the linkedin_manual data source config with import data
    const dataSource = await DataSource.findOne({ where: { name: 'linkedin_manual' } });
    if (!dataSource) {
      return res.status(404).json({ error: 'LinkedIn manual data source not configured' });
    }

    await dataSource.update({
      config: { ...dataSource.config, importData: projects },
    });

    // Run ingestion
    const result = await runIngestion('linkedin_manual');

    // Clear import data after ingestion
    await dataSource.update({
      config: { ...dataSource.config, importData: [] },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/freelance/refresh-pipeline
 * Manually trigger classification → scoring → snapshot pipeline.
 */
async function refreshPipeline(req, res, next) {
  try {
    logger.info('Manual freelance pipeline refresh triggered');

    const classificationRun = await classifyFreelanceOpportunities();
    await scoreFreelanceOpportunities();
    const snapshotRun = await generateDailySnapshot();

    const result = {
      message: 'Pipeline refresh complete',
      classification: {
        status: classificationRun.status,
        classified: classificationRun.outputCount || 0,
      },
      snapshot: {
        status: snapshotRun.status,
      },
    };

    logger.info('Manual freelance pipeline refresh complete', result);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listOpportunities,
  getOpportunity,
  getTrends,
  getSkillTrendData,
  generateAction,
  importProjects,
  refreshPipeline,
};
