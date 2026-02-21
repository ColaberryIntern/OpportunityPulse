const { Op, fn, col, literal } = require('sequelize');
const { Opportunity, FreelanceTrendSnapshot, AnalysisRun, sequelize } = require('../models');
const logger = require('../logging/logger');

/**
 * Generate daily demand trend snapshots for freelance skills.
 * Groups freelance opportunities by skill, computes aggregations,
 * and upserts into freelance_trend_snapshots.
 */
async function generateDailySnapshot() {
  const run = await AnalysisRun.create({
    type: 'freelance_trend_snapshot',
    status: 'running',
    opportunityType: 'freelance',
    startedAt: new Date(),
  });

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all freelance opportunities from last 30 days with classified skills
    const opportunities = await Opportunity.findAll({
      where: {
        type: 'freelance',
        createdAt: { [Op.gte]: thirtyDaysAgo },
      },
      attributes: ['id', 'value', 'sourceData', 'aiAnalysis', 'source'],
      raw: true,
    });

    if (opportunities.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No freelance opportunities in last 30 days.' },
        completedAt: new Date(),
      });
      return run;
    }

    // Build skill → aggregation map
    const skillMap = {};

    for (const opp of opportunities) {
      const aiAnalysis = typeof opp.aiAnalysis === 'string'
        ? JSON.parse(opp.aiAnalysis)
        : (opp.aiAnalysis || {});
      const sourceData = typeof opp.sourceData === 'string'
        ? JSON.parse(opp.sourceData)
        : (opp.sourceData || {});

      const skills = aiAnalysis.skills || [];
      const budget = parseFloat(opp.value) || parseFloat(sourceData.budget) || 0;
      const proposals = parseInt(sourceData.proposals || sourceData.bid_count || 0, 10);
      const platform = sourceData.platform || opp.source || 'unknown';

      for (const skill of skills) {
        const normalizedSkill = skill.toLowerCase().trim();
        if (!normalizedSkill) continue;

        if (!skillMap[normalizedSkill]) {
          skillMap[normalizedSkill] = {
            count: 0,
            totalBudget: 0,
            budgetCount: 0,
            totalProposals: 0,
            proposalCount: 0,
            platforms: {},
          };
        }

        const entry = skillMap[normalizedSkill];
        entry.count++;
        if (budget > 0) {
          entry.totalBudget += budget;
          entry.budgetCount++;
        }
        if (proposals > 0) {
          entry.totalProposals += proposals;
          entry.proposalCount++;
        }
        entry.platforms[platform] = (entry.platforms[platform] || 0) + 1;
      }
    }

    // Upsert snapshots
    const today = new Date().toISOString().split('T')[0];
    let snapshotCount = 0;

    for (const [skill, data] of Object.entries(skillMap)) {
      const topPlatforms = Object.entries(data.platforms)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([platform, count]) => ({ platform, count }));

      await FreelanceTrendSnapshot.upsert({
        snapshotDate: today,
        skill,
        demandCount: data.count,
        avgBudget: data.budgetCount > 0
          ? Math.round((data.totalBudget / data.budgetCount) * 100) / 100
          : null,
        avgProposals: data.proposalCount > 0
          ? Math.round((data.totalProposals / data.proposalCount) * 100) / 100
          : null,
        topPlatforms,
        metadata: {
          totalOpportunities: opportunities.length,
          snapshotWindow: '30d',
        },
      });
      snapshotCount++;
    }

    await run.update({
      status: 'success',
      inputCount: opportunities.length,
      outputCount: snapshotCount,
      results: {
        skillsTracked: snapshotCount,
        date: today,
      },
      completedAt: new Date(),
    });

    logger.info('Freelance trend snapshot complete', {
      opportunities: opportunities.length,
      skills: snapshotCount,
      date: today,
    });

    return run;
  } catch (error) {
    logger.error('Freelance trend snapshot failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

/**
 * Get top trending skills by demand growth rate.
 * Compares latest snapshot to 7-day-ago snapshot.
 */
async function getTrendingSkills(days = 30) {
  // Use the most recent snapshot date (handles cases where today's snapshot hasn't run yet)
  const latestDateResult = await FreelanceTrendSnapshot.max('snapshotDate');
  const endDate = latestDateResult || new Date().toISOString().split('T')[0];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];

  // Get latest snapshots per skill
  const latestSnapshots = await FreelanceTrendSnapshot.findAll({
    where: { snapshotDate: endDate },
    order: [['demand_count', 'DESC']],
    limit: 50,
    raw: true,
  });

  // Get 7-day-ago snapshots for comparison
  const compareDate = new Date();
  compareDate.setDate(compareDate.getDate() - 7);
  const compareDateStr = compareDate.toISOString().split('T')[0];

  const priorSnapshots = await FreelanceTrendSnapshot.findAll({
    where: { snapshotDate: compareDateStr },
    raw: true,
  });

  const priorMap = {};
  for (const snap of priorSnapshots) {
    priorMap[snap.skill] = snap;
  }

  // Compute growth rates
  const trending = latestSnapshots.map((snap) => {
    const prior = priorMap[snap.skill];
    const priorCount = prior?.demand_count || 0;
    const growthRate = priorCount > 0
      ? ((snap.demand_count - priorCount) / priorCount) * 100
      : (snap.demand_count > 0 ? 100 : 0);

    return {
      skill: snap.skill,
      demandCount: snap.demand_count,
      avgBudget: snap.avg_budget,
      avgProposals: snap.avg_proposals,
      topPlatforms: snap.top_platforms,
      growthRate: Math.round(growthRate * 10) / 10,
      priorCount,
    };
  });

  // Sort by demand count (most in-demand first), then growth rate
  trending.sort((a, b) => b.demandCount - a.demandCount || b.growthRate - a.growthRate);

  return trending.slice(0, 20);
}

/**
 * Get daily time series for a specific skill.
 */
async function getSkillTrend(skill, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const snapshots = await FreelanceTrendSnapshot.findAll({
    where: {
      skill: skill.toLowerCase(),
      snapshotDate: { [Op.gte]: startDate.toISOString().split('T')[0] },
    },
    order: [['snapshot_date', 'ASC']],
    raw: true,
  });

  return snapshots.map((s) => ({
    date: s.snapshot_date,
    demandCount: s.demand_count,
    avgBudget: s.avg_budget,
    avgProposals: s.avg_proposals,
  }));
}

/**
 * Get skill × platform demand matrix.
 */
async function getDemandHeatmap(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dateStr = startDate.toISOString().split('T')[0];

  // Get the most recent snapshot date
  const latestDate = await FreelanceTrendSnapshot.max('snapshotDate');
  if (!latestDate) return { skills: [], platforms: [], matrix: [] };

  const snapshots = await FreelanceTrendSnapshot.findAll({
    where: { snapshotDate: latestDate },
    order: [['demand_count', 'DESC']],
    limit: 20,
    raw: true,
  });

  const platforms = new Set();
  for (const snap of snapshots) {
    for (const p of (snap.top_platforms || [])) {
      platforms.add(p.platform);
    }
  }

  return {
    skills: snapshots.map((s) => s.skill),
    platforms: [...platforms],
    data: snapshots.map((s) => ({
      skill: s.skill,
      demandCount: s.demand_count,
      avgBudget: s.avg_budget,
      platforms: s.top_platforms || [],
    })),
  };
}

module.exports = {
  generateDailySnapshot,
  getTrendingSkills,
  getSkillTrend,
  getDemandHeatmap,
};
