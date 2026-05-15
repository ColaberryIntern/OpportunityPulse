// Deep Research Phase 6 — adaptive operational analytics.
//
// Read-only aggregation: rolls the Phase 4/5 persisted metrics + Phase 6
// run history into a single planning-grade analytics payload. No DB writes,
// no recomputation — just shape-and-join over the latest snapshots.

const {
  ResourceCapacitySnapshot, PortfolioScore, EcosystemMetric,
  VentureLifecycleEvent, ExecutionReadiness, VentureIdea,
  AdaptiveRefreshRun, DependencyEdge,
} = require('../models');

const DAY_MS = 86400000;

async function latestCapacity() {
  const row = await ResourceCapacitySnapshot.findOne({ order: [['created_at', 'DESC']] });
  return row ? row.toJSON() : null;
}

async function latestPortfolioScores() {
  // The most-recent run_id, then all scores in it.
  const top = await PortfolioScore.findOne({ order: [['created_at', 'DESC']] });
  if (!top) return [];
  const rows = await PortfolioScore.findAll({
    where: { runId: top.runId }, order: [['portfolio_rank', 'ASC']],
  });
  return rows.map((r) => r.toJSON());
}

async function ecosystemConcentration() {
  const rows = await EcosystemMetric.findAll({ order: [['computed_at', 'DESC']] });
  if (rows.length === 0) return { ecosystems: [], top_concentration: null };
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.ecosystemKey)) seen.set(r.ecosystemKey, r.toJSON());
  const ecosystems = [...seen.values()];
  const totalVentures = ecosystems.reduce((acc, e) => acc + Number(e.ventureCount || 0), 0) || 0;
  const withFractions = ecosystems.map((e) => ({
    ...e,
    fraction: totalVentures > 0 ? Number((Number(e.ventureCount || 0) / totalVentures).toFixed(3)) : 0,
  })).sort((a, b) => Number(b.ventureCount || 0) - Number(a.ventureCount || 0));
  return {
    ecosystems: withFractions,
    top_concentration: withFractions[0] ? withFractions[0].fraction : null,
  };
}

async function transitionFlow({ days = 30 } = {}) {
  const since = Date.now() - days * DAY_MS;
  const events = await VentureLifecycleEvent.findAll({
    where: {}, order: [['created_at', 'DESC']],
  });
  const recent = events.filter((e) => new Date(e.createdAt).getTime() >= since);
  const byState = {};
  for (const e of recent) {
    byState[e.toState] = (byState[e.toState] || 0) + 1;
  }
  return {
    days, total_transitions: recent.length,
    transitions_by_state: byState,
  };
}

async function readinessDistribution() {
  const rows = await ExecutionReadiness.findAll();
  const buckets = { '<40': 0, '40-59': 0, '60-74': 0, '75+': 0 };
  for (const r of rows) {
    const s = Number(r.executionReadinessScore || 0);
    if (s < 40) buckets['<40'] += 1;
    else if (s < 60) buckets['40-59'] += 1;
    else if (s < 75) buckets['60-74'] += 1;
    else buckets['75+'] += 1;
  }
  return { samples: rows.length, buckets };
}

async function refreshHealth({ days = 30 } = {}) {
  const since = Date.now() - days * DAY_MS;
  const runs = await AdaptiveRefreshRun.findAll({ order: [['started_at', 'DESC']] });
  const recent = runs.filter((r) => new Date(r.startedAt).getTime() >= since);
  const buckets = { success: 0, partial: 0, failed: 0, running: 0 };
  let durationTotal = 0;
  let durationCount = 0;
  for (const r of recent) {
    if (buckets[r.status] != null) buckets[r.status] += 1;
    if (r.durationMs != null) {
      durationTotal += Number(r.durationMs);
      durationCount += 1;
    }
  }
  return {
    days,
    total_runs: recent.length,
    by_status: buckets,
    avg_duration_ms: durationCount > 0 ? Math.round(durationTotal / durationCount) : null,
    last_run: runs.length > 0 ? runs[0].toJSON() : null,
  };
}

async function dependencyLoad() {
  const edges = await DependencyEdge.findAll();
  const byStatus = {};
  for (const e of edges) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  return {
    total_edges: edges.length,
    by_status: byStatus,
    proposed: byStatus.proposed || 0,
    confirmed: byStatus.confirmed || 0,
    resolved: byStatus.resolved || 0,
    dismissed: byStatus.dismissed || 0,
  };
}

// Top-level read aggregator for the planning dashboard.
async function getAdaptiveAnalytics({ days = 30 } = {}) {
  const [capacity, scores, ecosystems, transitions, readiness, refresh, deps, ventures] = await Promise.all([
    latestCapacity(),
    latestPortfolioScores(),
    ecosystemConcentration(),
    transitionFlow({ days }),
    readinessDistribution(),
    refreshHealth({ days }),
    dependencyLoad(),
    VentureIdea.findAll(),
  ]);
  const activeStates = new Set(['evaluating', 'approved', 'generating_requirements', 'planning_mvp', 'building', 'validating', 'launching']);
  const totals = {
    total_ventures: ventures.length,
    active: ventures.filter((v) => activeStates.has(v.lifecycleState)).length,
    archived: ventures.filter((v) => v.lifecycleState === 'archived').length,
    monitoring: ventures.filter((v) => v.lifecycleState === 'monitoring').length,
  };
  return {
    captured_at: new Date().toISOString(),
    days_window: days,
    totals,
    capacity,
    portfolio_scores: scores.slice(0, 50),
    ecosystem_concentration: ecosystems,
    transition_flow: transitions,
    readiness_distribution: readiness,
    refresh_health: refresh,
    dependency_load: deps,
  };
}

module.exports = {
  latestCapacity, latestPortfolioScores, ecosystemConcentration,
  transitionFlow, readinessDistribution, refreshHealth, dependencyLoad,
  getAdaptiveAnalytics,
};
