const { Op, fn, col, literal } = require('sequelize');
const { User, Content, UserActivity, Opportunity, AnalysisRun } = require('../models');
const { PAGINATION } = require('../config/constants');

/**
 * Get aggregated platform statistics for the dashboard.
 */
async function getStats(userId) {
  const [totalUsers, totalContent, myContentCount, recentActivityCount] = await Promise.all([
    User.count(),
    Content.count(),
    Content.count({ where: { userId } }),
    UserActivity.count({ where: { userId } }),
  ]);

  return {
    totalUsers,
    totalContent,
    myContentCount,
    recentActivityCount,
  };
}

/**
 * Get paginated recent activity for a user.
 */
async function getActivity(userId, { page, limit } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const offset = (safePage - 1) * safeLimit;

  const { rows: activities, count: total } = await UserActivity.findAndCountAll({
    where: { userId },
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    activities,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Get opportunity-specific stats for the dashboard.
 */
async function getOpportunityStats() {
  const [totalOpps, activeOpps, scoredOpps, avgScoreResult, totalValueResult] = await Promise.all([
    Opportunity.count(),
    Opportunity.count({ where: { status: 'active' } }),
    Opportunity.count({ where: { aiScore: { [Op.ne]: null } } }),
    Opportunity.findOne({
      attributes: [[fn('AVG', col('ai_score')), 'avgScore']],
      where: { aiScore: { [Op.ne]: null } },
      raw: true,
    }),
    Opportunity.findOne({
      attributes: [[fn('SUM', col('value')), 'totalValue']],
      where: { value: { [Op.ne]: null } },
      raw: true,
    }),
  ]);

  return {
    totalOpportunities: totalOpps,
    activeOpportunities: activeOpps,
    scoredOpportunities: scoredOpps,
    averageAiScore: avgScoreResult?.avgScore
      ? parseFloat(parseFloat(avgScoreResult.avgScore).toFixed(1))
      : null,
    totalValue: totalValueResult?.totalValue
      ? parseFloat(totalValueResult.totalValue)
      : null,
  };
}

/**
 * Get time-series chart data for opportunities.
 * Groups opportunity counts by day within the requested period.
 */
async function getChartData(type, period = '30d') {
  const periodDays = { '7d': 7, '30d': 30, '90d': 90 };
  const days = periodDays[period] || 30;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = { createdAt: { [Op.gte]: since } };
  if (type) where.type = type;

  const results = await Opportunity.findAll({
    attributes: [
      [fn('DATE', col('created_at')), 'date'],
      [fn('COUNT', col('id')), 'count'],
    ],
    where,
    group: [fn('DATE', col('created_at'))],
    order: [[fn('DATE', col('created_at')), 'ASC']],
    raw: true,
  });

  return {
    period,
    type: type || 'all',
    dataPoints: results.map((r) => ({
      date: r.date,
      count: parseInt(r.count, 10),
    })),
  };
}

/**
 * Get summary of latest trends per opportunity type.
 */
async function getTrendSummary() {
  const types = ['gov_contract', 'ai_job', 'investment'];
  const summaries = {};

  for (const type of types) {
    const run = await AnalysisRun.findOne({
      where: { type: 'trend_detection', status: 'success', opportunityType: type },
      order: [['started_at', 'DESC']],
    });

    summaries[type] = run
      ? { trends: run.results?.trends || [], summary: run.results?.summary || null, analyzedAt: run.completedAt }
      : null;
  }

  return summaries;
}

module.exports = {
  getStats,
  getActivity,
  getOpportunityStats,
  getChartData,
  getTrendSummary,
};
