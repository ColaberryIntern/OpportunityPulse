// Deep Research Phase 5 — predictive capacity forecasting.
//
// Deterministic. Projects future staffing + queue pressure at three time
// horizons (30 / 90 / 180 days) under optimistic / realistic / conservative
// scenarios. Inputs are the Phase 4 capacity snapshot + the execution
// capacity plan (which already schedules each venture into a slot/week);
// projection is a linear walk over the schedule with scenario multipliers.
//
// Persists predictive_capacity rows; rationale spelled out per row.

const { PredictiveCapacity } = require('../models');
const resourceCapacity = require('./resourceCapacity.service');
const executionCapacityPlanner = require('./executionCapacityPlanner.service');

const HORIZONS_DAYS = [30, 90, 180];
const SCENARIOS = ['optimistic', 'realistic', 'conservative'];

// Scenario multipliers — applied to schedule slippage + new-venture arrivals.
const SCENARIO_MULT = {
  optimistic: { slippage: 1.0, arrivals: 0 },
  realistic: { slippage: 1.15, arrivals: 1 },
  conservative: { slippage: 1.5, arrivals: 2 },
};

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));

// At a given week, which scheduled ventures are still active?
function activeAtWeek(planSequence, weekIndex, slippage) {
  if (!Array.isArray(planSequence)) return [];
  return planSequence.filter((p) => {
    if (p.scheduled_week_start == null) return false;
    const start = Number(p.scheduled_week_start) * slippage;
    const end = Number(p.scheduled_week_end) * slippage;
    return weekIndex >= start && weekIndex < end;
  });
}

// At a given week, ventures still queued (scheduled but not yet started).
function queuedAtWeek(planSequence, weekIndex, slippage) {
  if (!Array.isArray(planSequence)) return [];
  return planSequence.filter((p) => {
    if (p.scheduled_week_start == null) return false;
    return Number(p.scheduled_week_start) * slippage > weekIndex;
  });
}

// Compute the forecast for one (horizon, scenario) pair. Pure given inputs.
function forecastOne({
  horizonDays, scenario, plan, capacitySnapshot,
}) {
  const mult = SCENARIO_MULT[scenario] || SCENARIO_MULT.realistic;
  const weekIndex = horizonDays / 7;
  const concurrencyLimit = (capacitySnapshot && (capacitySnapshot.concurrency_limit
    || capacitySnapshot.concurrencyLimit)) || 1;
  const planSequence = (plan && plan.sequence) || [];

  const active = activeAtWeek(planSequence, weekIndex, mult.slippage);
  const queued = queuedAtWeek(planSequence, weekIndex, mult.slippage);
  // Conservative scenario assumes new ventures arrive into the queue.
  const queuedCount = queued.length + mult.arrivals;
  const activeCount = active.length;

  // Staffing pressure projection: active vs concurrency, clamped.
  const projectedStaffing = clamp100(concurrencyLimit > 0
    ? (activeCount / concurrencyLimit) * 100 : 100);
  // Queue pressure: queued vs concurrency.
  const projectedQueue = clamp100(concurrencyLimit > 0
    ? (queuedCount / concurrencyLimit) * 50 : 100);
  const projectedConcurrencyDemand = activeCount + queuedCount;

  // Bottleneck risks: rationale-only short list derived from the current
  // bottlenecks projected forward.
  const currentBottlenecks = (capacitySnapshot && capacitySnapshot.bottlenecks) || [];
  const bottleneckRisks = currentBottlenecks
    .filter((b) => b.severity >= 50)
    .map((b) => ({
      type: b.type,
      label: b.label,
      // Risk lifts under conservative + queue pressure.
      risk_score: clamp100(Number(b.severity) * (mult.slippage * 0.9) + projectedQueue * 0.1),
      eta_days: horizonDays,
    }))
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 6);

  const rationale = `${horizonDays}-day ${scenario}: ${activeCount} venture(s) active vs `
    + `concurrency ${concurrencyLimit}, ${queuedCount} queued. Slippage ×${mult.slippage}`
    + (mult.arrivals ? `, +${mult.arrivals} new venture arrival(s) assumed.` : '.');

  return {
    horizon_days: horizonDays,
    scenario,
    projected_staffing_pressure: projectedStaffing,
    projected_queue_pressure: projectedQueue,
    projected_concurrency_demand: projectedConcurrencyDemand,
    bottleneck_risks: bottleneckRisks,
    rationale,
    metadata: {
      slippage_multiplier: mult.slippage,
      assumed_new_arrivals: mult.arrivals,
      active_venture_ids: active.map((p) => p.venture_idea_id),
      queued_venture_ids: queued.map((p) => p.venture_idea_id),
    },
  };
}

// Run + persist all (horizon × scenario) forecasts.
async function forecastAll() {
  const [capacitySnapshot, plan] = await Promise.all([
    resourceCapacity.getLatestSnapshot(),
    executionCapacityPlanner.planCapacity(),
  ]);
  const results = [];
  for (const horizonDays of HORIZONS_DAYS) {
    for (const scenario of SCENARIOS) {
      const f = forecastOne({ horizonDays, scenario, plan, capacitySnapshot });
      // eslint-disable-next-line no-await-in-loop
      await PredictiveCapacity.create({
        horizonDays: f.horizon_days,
        scenario: f.scenario,
        projectedStaffingPressure: f.projected_staffing_pressure,
        projectedQueuePressure: f.projected_queue_pressure,
        projectedConcurrencyDemand: f.projected_concurrency_demand,
        bottleneckRisks: f.bottleneck_risks,
        rationale: f.rationale,
        metadata: f.metadata,
      });
      results.push(f);
    }
  }
  return { computed_at: new Date(), forecasts: results };
}

// Latest forecast set, grouped by horizon → scenario.
async function getLatestForecasts() {
  const rows = await PredictiveCapacity.findAll({ order: [['computed_at', 'DESC']] });
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.horizonDays}|${r.scenario}`;
    if (!seen.has(key)) seen.set(key, r.toJSON());
  }
  const grouped = {};
  for (const r of seen.values()) {
    const k = `h${r.horizonDays}`;
    if (!grouped[k]) grouped[k] = {};
    grouped[k][r.scenario] = r;
  }
  return grouped;
}

module.exports = {
  HORIZONS_DAYS,
  SCENARIOS,
  SCENARIO_MULT,
  activeAtWeek,
  queuedAtWeek,
  forecastOne,
  forecastAll,
  getLatestForecasts,
};
