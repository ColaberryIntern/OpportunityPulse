// Deep Research Phase 4 — portfolio intelligence orchestrator.
//
// The top-level coordinator for Phase 4: it runs every Phase 4 engine in
// dependency order, then assembles the dashboard view. Each engine is
// independently testable + persists its own state; this service is the
// thin orchestration layer that wires them together.
//
// Also hosts the operational-visibility metrics (queue pressure, venture
// velocity, cycle-time, decision quality, readiness aging) — they're
// derived reads, not their own engine.

const { Op } = require('sequelize');
const {
  VentureIdea, ExecutionReadiness, ExecutionQueueItem,
  VentureLifecycleEvent, ReassessmentEvent,
} = require('../models');
const resourceCapacity = require('./resourceCapacity.service');
const sharedInfrastructure = require('./sharedInfrastructure.service');
const ventureDependency = require('./ventureDependency.service');
const portfolioForecasting = require('./portfolioForecasting.service');
const portfolioPrioritization = require('./portfolioPrioritization.service');
const executionCapacityPlanner = require('./executionCapacityPlanner.service');
const ventureTemplate = require('./ventureTemplate.service');
const confidenceDecay = require('./confidenceDecay.service');
const logger = require('../logging/logger');

// Full refresh: runs every engine and persists. Each step's failure is
// captured + the run continues — observability over fragile coupling.
async function refreshPortfolio() {
  const errors = [];
  const out = {};

  const steps = [
    ['capacity', async () => { out.capacity = await resourceCapacity.assessCapacity(); }],
    ['overlaps', async () => { out.overlaps = await sharedInfrastructure.detectOverlaps(); }],
    ['dependencies', async () => { out.dependencies = await ventureDependency.buildDependencyGraph(); }],
    ['forecasts', async () => { out.forecasts = await portfolioForecasting.forecastPortfolio(); }],
    ['ranking', async () => {
      out.ranking = await portfolioPrioritization.runPrioritization(out.capacity, out.forecasts);
    }],
    ['plan', async () => { out.plan = await executionCapacityPlanner.planCapacity(); }],
    ['templates', async () => { out.templates = await ventureTemplate.detectTemplates(); }],
    ['decay', async () => { out.decay = await confidenceDecay.runDecayPass(); }],
  ];
  for (const [name, fn] of steps) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn();
    } catch (e) {
      errors.push({ step: name, error: e.message });
      logger.warn('portfolioIntelligence: step failed', { step: name, error: e.message });
    }
  }
  logger.info('portfolioIntelligence: refresh complete', {
    capacityPressure: out.capacity && out.capacity.staffing_pressure,
    ventureCount: out.ranking && out.ranking.ranking ? out.ranking.ranking.length : 0,
    errors: errors.length,
  });
  return { ok: errors.length === 0, errors, ...out };
}

// ---------------------------------------------------------------------------
// Operational visibility — derived reads, no engine.
// ---------------------------------------------------------------------------

const SECONDS_PER_DAY = 86400000;

async function computeOperationalMetrics() {
  // Lifecycle events for velocity + cycle time.
  const events = await VentureLifecycleEvent.findAll({ order: [['created_at', 'ASC']] });
  const now = Date.now();
  const sevenDaysAgo = now - 7 * SECONDS_PER_DAY;
  const thirtyDaysAgo = now - 30 * SECONDS_PER_DAY;

  const eventsPer7d = events.filter((e) => new Date(e.createdAt).getTime() >= sevenDaysAgo).length;
  const eventsPer30d = events.filter((e) => new Date(e.createdAt).getTime() >= thirtyDaysAgo).length;
  const ventureVelocity = {
    transitions_per_7d: eventsPer7d,
    transitions_per_30d: eventsPer30d,
  };

  // Cycle time per stage: for each completed (state, next-state) pair on the
  // same venture, time elapsed in the prior state.
  const byVenture = new Map();
  for (const e of events) {
    if (!byVenture.has(e.ventureIdeaId)) byVenture.set(e.ventureIdeaId, []);
    byVenture.get(e.ventureIdeaId).push(e);
  }
  const stageDurations = new Map(); // state → [durations in days]
  for (const list of byVenture.values()) {
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const next = list[i];
      const dur = (new Date(next.createdAt).getTime() - new Date(prev.createdAt).getTime())
        / SECONDS_PER_DAY;
      const stage = prev.toState; // duration spent IN that state
      if (!stageDurations.has(stage)) stageDurations.set(stage, []);
      stageDurations.get(stage).push(dur);
    }
  }
  const cycleTime = {};
  for (const [stage, durs] of stageDurations.entries()) {
    durs.sort((a, b) => a - b);
    cycleTime[stage] = {
      samples: durs.length,
      median_days: durs.length ? Number(durs[Math.floor(durs.length / 2)].toFixed(2)) : null,
    };
  }

  // Queue pressure — how many ventures sit in the active queue states.
  const queueCount = await ExecutionQueueItem.count({
    where: { lifecycleState: { [Op.in]: Array.from(resourceCapacity.ACTIVE_STATES) } },
  });
  const buildNowQueueCount = await ExecutionReadiness.count({
    where: { '$breakdown.decision.decision$': 'BUILD_NOW' },
  }).catch(() => null); // breakdown JSONB filter may not work cleanly — fall back below
  let buildNowCount = buildNowQueueCount;
  if (buildNowCount == null) {
    const all = await ExecutionReadiness.findAll();
    buildNowCount = all.filter(
      (r) => r.breakdown && r.breakdown.decision && r.breakdown.decision.decision === 'BUILD_NOW',
    ).length;
  }

  // Decision quality — % of BUILD_NOW ventures that progressed past
  // 'approved' (a weak but real signal that the decision was actionable).
  const allReadiness = await ExecutionReadiness.findAll();
  const buildNowRows = allReadiness.filter(
    (r) => r.breakdown && r.breakdown.decision && r.breakdown.decision.decision === 'BUILD_NOW',
  );
  const buildNowVentureIds = buildNowRows.map((r) => r.ventureIdeaId);
  const progressedStates = new Set(['planning_mvp', 'building', 'validating', 'launching', 'monitoring']);
  const buildNowProgressed = buildNowVentureIds.length
    ? (await VentureIdea.findAll({
      where: { id: { [Op.in]: buildNowVentureIds } },
    })).filter((v) => progressedStates.has(v.lifecycleState)).length : 0;
  const decisionQuality = {
    build_now_count: buildNowCount,
    build_now_progressed: buildNowProgressed,
    progression_rate: buildNowCount > 0 ? Number((buildNowProgressed / buildNowCount).toFixed(3)) : null,
  };

  // Readiness aging — for ventures with an assessment, how old is it?
  const readinessAges = allReadiness.map((r) => (now - new Date(r.updatedAt).getTime()) / SECONDS_PER_DAY);
  readinessAges.sort((a, b) => a - b);
  const median = readinessAges.length ? readinessAges[Math.floor(readinessAges.length / 2)] : null;
  const stale = readinessAges.filter((d) => d > confidenceDecay.ASSESSMENT_GRACE_DAYS).length;

  // Pending reassessment recommendations.
  const pendingRecommendations = await ReassessmentEvent.count({ where: { status: 'pending' } });

  return {
    venture_velocity: ventureVelocity,
    cycle_time_by_stage: cycleTime,
    queue_pressure: {
      active_queue: queueCount,
      build_now: buildNowCount,
      pending_recommendations: pendingRecommendations,
    },
    decision_quality: decisionQuality,
    readiness_aging: {
      median_age_days: median != null ? Number(median.toFixed(1)) : null,
      stale_count: stale,
      grace_days: confidenceDecay.ASSESSMENT_GRACE_DAYS,
    },
  };
}

// Assemble the full dashboard read. Pulls each engine's latest persisted
// state + the operational metrics into one payload.
async function getPortfolioDashboard() {
  const [
    capacity, ranking, forecasts, overlaps, dependencies, plan,
    templates, recommendations, ops,
  ] = await Promise.all([
    resourceCapacity.getLatestSnapshot(),
    portfolioPrioritization.getLatestRanking(),
    portfolioForecasting.getLatestForecast(),
    sharedInfrastructure.listOverlaps(),
    ventureDependency.getDependencyGraph(),
    executionCapacityPlanner.planCapacity().catch(() => null),
    ventureTemplate.listTemplates(),
    confidenceDecay.listPendingRecommendations(),
    computeOperationalMetrics(),
  ]);
  return {
    capacity, ranking, forecasts, overlaps, dependencies, plan,
    templates, recommendations, operational_metrics: ops,
  };
}

module.exports = {
  refreshPortfolio,
  getPortfolioDashboard,
  computeOperationalMetrics,
};
