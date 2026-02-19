const { Op } = require('sequelize');
const { Opportunity, MetaSignal, sequelize } = require('../models');
const logger = require('../logging/logger');

/**
 * Daily meta signal computation.
 * Aggregates trend-level signals across all opportunities from the last 30 days.
 * Updates current_value, previous_value, trend_direction in meta_signals table.
 */
async function computeMetaSignals() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

  try {
    const signals = await MetaSignal.findAll();
    const signalMap = new Map(signals.map((s) => [s.slug, s]));

    // Aggregate recent (last 30 days) and prior (30-60 days) period data
    const [recentData] = await sequelize.query(`
      SELECT type, COUNT(*) as cnt, AVG(CAST(ai_score AS FLOAT)) as avg_score,
             AVG(CAST(value AS FLOAT)) as avg_value
      FROM opportunities
      WHERE status = 'active' AND published_at > :since
      GROUP BY type
    `, { replacements: { since: thirtyDaysAgo } });

    const [priorData] = await sequelize.query(`
      SELECT type, COUNT(*) as cnt, AVG(CAST(ai_score AS FLOAT)) as avg_score,
             AVG(CAST(value AS FLOAT)) as avg_value
      FROM opportunities
      WHERE status = 'active' AND published_at > :priorStart AND published_at <= :priorEnd
      GROUP BY type
    `, { replacements: { priorStart: sixtyDaysAgo, priorEnd: thirtyDaysAgo } });

    const recent = {};
    for (const row of recentData) {
      recent[row.type] = { count: parseInt(row.cnt, 10), avgScore: parseFloat(row.avg_score) || 0, avgValue: parseFloat(row.avg_value) || 0 };
    }

    const prior = {};
    for (const row of priorData) {
      prior[row.type] = { count: parseInt(row.cnt, 10), avgScore: parseFloat(row.avg_score) || 0, avgValue: parseFloat(row.avg_value) || 0 };
    }

    const computeGrowthScore = (recentCount, priorCount) => {
      if (priorCount === 0) return recentCount > 0 ? 80 : 0;
      const growth = ((recentCount - priorCount) / priorCount) * 100;
      return Math.min(100, Math.max(0, 50 + growth));
    };

    const getTrend = (current, previous) => {
      if (current > previous * 1.1) return 'up';
      if (current < previous * 0.9) return 'down';
      return 'stable';
    };

    // Compute each signal
    const updates = {
      ai_talent_shortage: () => {
        const jobs = recent.ai_job || { count: 0, avgScore: 0 };
        const priorJobs = prior.ai_job || { count: 0, avgScore: 0 };
        const currentVal = computeGrowthScore(jobs.count, priorJobs.count);
        return { currentVal, previousVal: computeGrowthScore(priorJobs.count, priorJobs.count) };
      },
      ai_compensation_spike: () => {
        const jobs = recent.ai_job || { avgValue: 0 };
        const priorJobs = prior.ai_job || { avgValue: 0 };
        const currentVal = jobs.avgValue > 0 ? Math.min(100, (jobs.avgValue / 200000) * 100) : 0;
        const previousVal = priorJobs.avgValue > 0 ? Math.min(100, (priorJobs.avgValue / 200000) * 100) : 0;
        return { currentVal, previousVal };
      },
      ai_compliance_burden: () => {
        const news = recent.ai_news || { count: 0 };
        const priorNews = prior.ai_news || { count: 0 };
        // Proxy: news volume about regulation
        const currentVal = Math.min(100, news.count * 2);
        const previousVal = Math.min(100, priorNews.count * 2);
        return { currentVal, previousVal };
      },
      ai_procurement_acceleration: () => {
        const gov = recent.gov_contract || { count: 0 };
        const priorGov = prior.gov_contract || { count: 0 };
        const currentVal = computeGrowthScore(gov.count, priorGov.count);
        return { currentVal, previousVal: computeGrowthScore(priorGov.count, priorGov.count) };
      },
      ai_infrastructure_spending: () => {
        const inv = recent.investment || { avgValue: 0, count: 0 };
        const priorInv = prior.investment || { avgValue: 0, count: 0 };
        const currentVal = Math.min(100, (inv.count * (inv.avgValue || 0)) / 1000000);
        const previousVal = Math.min(100, (priorInv.count * (priorInv.avgValue || 0)) / 1000000);
        return { currentVal, previousVal };
      },
      ai_safety_mandate: () => {
        const news = recent.ai_news || { count: 0 };
        const priorNews = prior.ai_news || { count: 0 };
        const currentVal = Math.min(100, news.count * 1.5);
        const previousVal = Math.min(100, priorNews.count * 1.5);
        return { currentVal, previousVal };
      },
      ai_regulation_pressure: () => {
        const gov = recent.gov_contract || { count: 0 };
        const news = recent.ai_news || { count: 0 };
        const priorGov = prior.gov_contract || { count: 0 };
        const priorNews = prior.ai_news || { count: 0 };
        const currentVal = Math.min(100, (gov.count + news.count) * 1.2);
        const previousVal = Math.min(100, (priorGov.count + priorNews.count) * 1.2);
        return { currentVal, previousVal };
      },
      ai_datacenter_expansion: () => {
        const inv = recent.investment || { count: 0 };
        const priorInv = prior.investment || { count: 0 };
        const currentVal = computeGrowthScore(inv.count, priorInv.count);
        return { currentVal, previousVal: computeGrowthScore(priorInv.count, priorInv.count) };
      },
    };

    const results = {};

    for (const [slug, computeFn] of Object.entries(updates)) {
      const signal = signalMap.get(slug);
      if (!signal) continue;

      const { currentVal, previousVal } = computeFn();
      const trend = getTrend(currentVal, previousVal);

      await signal.update({
        currentValue: Math.round(currentVal * 100) / 100,
        previousValue: Math.round(previousVal * 100) / 100,
        trendDirection: trend,
        computedAt: now,
      });

      results[slug] = { current: currentVal, previous: previousVal, trend };
    }

    logger.info('Meta signal computation complete', { signalsUpdated: Object.keys(results).length });
    return results;
  } catch (error) {
    logger.error('Meta signal computation failed', { error: error.message });
    throw error;
  }
}

module.exports = { computeMetaSignals };
