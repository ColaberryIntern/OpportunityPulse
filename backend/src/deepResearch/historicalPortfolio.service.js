// Deep Research Phase 5 — historical portfolio analytics.
//
// Deterministic. Reads the time-series tables that Phases 3 + 4 already
// populate (confidence_history, resource_capacity_snapshots,
// venture_lifecycle_events, portfolio_scores, execution_readiness) and
// assembles "over time" views for the observatory dashboard.

const { Op, fn, col, literal } = require('sequelize');
const {
  ResourceCapacitySnapshot, ConfidenceHistory, VentureLifecycleEvent,
  PortfolioScore, VentureIdea, ExecutionReadiness,
} = require('../models');

// Pressure-over-time series from resource_capacity_snapshots.
async function getCapacityTimeline({ days = 90 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await ResourceCapacitySnapshot.findAll({
    where: { createdAt: { [Op.gte]: since } },
    order: [['created_at', 'ASC']],
    attributes: ['createdAt', 'staffingPressure', 'infraPressure', 'concurrencyLimit', 'activeVentures', 'buildNowVentures'],
  });
  return rows.map((r) => ({
    at: r.createdAt,
    staffing_pressure: Number(r.staffingPressure),
    infra_pressure: Number(r.infraPressure),
    concurrency_limit: r.concurrencyLimit,
    active_ventures: r.activeVentures,
    build_now_ventures: r.buildNowVentures,
  }));
}

// Venture velocity (lifecycle transitions per day) over the period.
async function getVentureVelocity({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const events = await VentureLifecycleEvent.findAll({
    where: { createdAt: { [Op.gte]: since } },
    attributes: ['createdAt', 'toState', 'ventureIdeaId'],
    order: [['created_at', 'ASC']],
  });
  // Bucket by day.
  const byDay = {};
  for (const e of events) {
    const day = new Date(e.createdAt).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }
  const series = Object.entries(byDay)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, count]) => ({ day, transitions: count }));
  return {
    total_transitions: events.length,
    distinct_ventures: new Set(events.map((e) => e.ventureIdeaId)).size,
    daily_series: series,
  };
}

// Readiness aging trend — median assessment age per snapshot point. Light:
// reports current median + the count of ventures over the grace window.
async function getReadinessAgingTrend({ graceDays = 30 } = {}) {
  const rows = await ExecutionReadiness.findAll({ attributes: ['ventureIdeaId', 'updatedAt'] });
  const now = Date.now();
  const ages = rows.map((r) => (now - new Date(r.updatedAt).getTime()) / 86400000);
  ages.sort((a, b) => a - b);
  const median = ages.length ? ages[Math.floor(ages.length / 2)] : null;
  return {
    sample_count: ages.length,
    median_age_days: median != null ? Number(median.toFixed(1)) : null,
    stale_count: ages.filter((a) => a > graceDays).length,
    grace_days: graceDays,
    ages: ages.map((a) => Number(a.toFixed(1))),
  };
}

// Confidence trajectory rollup — for each venture, the most recent vs
// earliest confidence in the period.
async function getConfidenceTrend({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await ConfidenceHistory.findAll({
    where: { computedAt: { [Op.gte]: since } },
    order: [['computed_at', 'ASC']],
  });
  const byVenture = new Map();
  for (const r of rows) {
    if (!byVenture.has(r.ventureIdeaId)) byVenture.set(r.ventureIdeaId, []);
    byVenture.get(r.ventureIdeaId).push({ at: r.computedAt, conf: Number(r.confidence) });
  }
  const trend = [];
  for (const [ventureId, series] of byVenture) {
    const first = series[0];
    const last = series[series.length - 1];
    trend.push({
      venture_idea_id: ventureId,
      samples: series.length,
      first_confidence: first.conf,
      last_confidence: last.conf,
      delta: Number((last.conf - first.conf).toFixed(3)),
    });
  }
  return { ventures: trend, total_samples: rows.length };
}

// Portfolio score trend — runs over time. Each run is a snapshot of how the
// portfolio ranked at that moment.
async function getPortfolioRankingTrend({ days = 90, limitRuns = 12 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  // Get distinct run ids in the window.
  const runs = await PortfolioScore.findAll({
    where: { createdAt: { [Op.gte]: since } },
    attributes: [[fn('DISTINCT', col('run_id')), 'runId'], [fn('MIN', col('created_at')), 'createdAt']],
    group: ['run_id'],
    order: [[literal('MIN(created_at)'), 'ASC']],
    limit: limitRuns,
    raw: true,
  });
  // For each run, fetch its rankings (top 5 for the trend view).
  const series = [];
  for (const r of runs) {
    // eslint-disable-next-line no-await-in-loop
    const top = await PortfolioScore.findAll({
      where: { runId: r.runId },
      order: [['portfolio_rank', 'ASC']],
      limit: 5,
    });
    series.push({
      run_id: r.runId,
      at: r.createdAt,
      top: top.map((t) => ({
        venture_idea_id: t.ventureIdeaId,
        rank: t.portfolioRank,
        score: Number(t.portfolioScore),
        sequencing: t.sequencingRecommendation,
      })),
    });
  }
  return { runs: series };
}

// Compose the full historical portfolio analytics payload.
async function getHistoricalAnalytics({ days = 90 } = {}) {
  const [capacity, velocity, aging, confidence, ranking] = await Promise.all([
    getCapacityTimeline({ days }),
    getVentureVelocity({ days: Math.min(days, 60) }),
    getReadinessAgingTrend({}),
    getConfidenceTrend({ days }),
    getPortfolioRankingTrend({ days }),
  ]);
  return {
    period_days: days,
    capacity_timeline: capacity,
    venture_velocity: velocity,
    readiness_aging: aging,
    confidence_trend: confidence,
    ranking_trend: ranking,
  };
}

module.exports = {
  getCapacityTimeline,
  getVentureVelocity,
  getReadinessAgingTrend,
  getConfidenceTrend,
  getPortfolioRankingTrend,
  getHistoricalAnalytics,
};
