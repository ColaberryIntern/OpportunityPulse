const { Op, fn, col, literal } = require('sequelize');
const { User, Content, UserActivity, Opportunity, AnalysisRun } = require('../models');
const { PAGINATION } = require('../config/constants');

/**
 * Get aggregated platform statistics for the dashboard.
 */
async function getStats(userId) {
  const [totalUsers, totalContent, myContentCount, recentActivityCount, budgetSignals, actorSignals, enterpriseSignals, complianceSignals] = await Promise.all([
    User.count(),
    Content.count(),
    Content.count({ where: { userId } }),
    UserActivity.count({ where: { userId } }),
    Opportunity.count({ where: { status: 'active', aiAnalysis: { rssSignals: { budget: { [Op.ne]: null } } } } }),
    Opportunity.count({ where: { status: 'active', aiAnalysis: { rssSignals: { actor: { [Op.ne]: null } } } } }),
    Opportunity.count({ where: { status: 'active', aiAnalysis: { rssSignals: { enterprise: { [Op.ne]: null } } } } }),
    Opportunity.count({ where: { status: 'active', aiAnalysis: { rssSignals: { compliance: { [Op.ne]: null } } } } }),
  ]);

  return {
    totalUsers,
    totalContent,
    myContentCount,
    recentActivityCount,
    rssSignals: {
      budget: budgetSignals,
      actor: actorSignals,
      enterprise: enterpriseSignals,
      compliance: complianceSignals,
    },
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
 * Get time-series chart data for opportunities, broken down by type.
 * Returns per-type counts per day within the requested period.
 */
async function getChartData(type, period = '30d') {
  const periodDays = { '7d': 7, '30d': 30, '90d': 90 };
  const days = periodDays[period] || 30;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const types = ['gov_contract', 'ai_job', 'investment', 'grant', 'ai_news', 'freelance'];

  const results = await Opportunity.findAll({
    attributes: [
      [fn('DATE', col('created_at')), 'date'],
      'type',
      [fn('COUNT', col('id')), 'count'],
    ],
    where: { createdAt: { [Op.gte]: since } },
    group: [fn('DATE', col('created_at')), 'type'],
    order: [[fn('DATE', col('created_at')), 'ASC']],
    raw: true,
  });

  // Build date-keyed map with per-type counts
  const dateMap = {};
  for (const row of results) {
    if (!dateMap[row.date]) {
      dateMap[row.date] = { date: row.date };
      for (const t of types) dateMap[row.date][t] = 0;
    }
    if (types.includes(row.type)) {
      dateMap[row.date][row.type] = parseInt(row.count, 10);
    }
  }

  // Fill missing dates with zeros
  const allDates = [];
  for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    if (!dateMap[dateStr]) {
      dateMap[dateStr] = { date: dateStr };
      for (const t of types) dateMap[dateStr][t] = 0;
    }
    allDates.push(dateStr);
  }

  return {
    period,
    dataPoints: allDates.map((d) => dateMap[d]),
  };
}

/**
 * Get summary of latest trends per opportunity type.
 */
async function getTrendSummary() {
  const types = ['gov_contract', 'ai_job', 'investment', 'grant', 'ai_news', 'freelance'];
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
