// Deep Research Phase 5 — historical signal timelines.
//
// Deterministic. A thin time-series capture layer for portfolio + venture
// signals so the observatory can chart them over time. Reads existing
// snapshots (resource_capacity_snapshots, signal_correlations, etc.) and
// writes signal_history rows whenever the observatory refreshes.

const { Op } = require('sequelize');
const {
  SignalHistory, ResourceCapacitySnapshot, SignalCorrelation, ExecutionReadiness,
} = require('../models');

// Record one signal point.
async function recordSignal(key, value, { scope = 'portfolio', scopeId = null, metadata = {} } = {}) {
  return SignalHistory.create({
    signalKey: key,
    signalValue: value == null ? null : Number(value),
    scope,
    scopeId,
    metadata,
  });
}

// Snapshot the current portfolio-level signals. Pulls the most recent
// values from existing tables + records them into signal_history with
// today's timestamp. Idempotent at the "one snapshot per refresh" level.
async function snapshotPortfolioSignals() {
  const captured = [];
  const capacity = await ResourceCapacitySnapshot.findOne({ order: [['created_at', 'DESC']] });
  if (capacity) {
    captured.push(await recordSignal('staffing_pressure', capacity.staffingPressure));
    captured.push(await recordSignal('infra_pressure', capacity.infraPressure));
    captured.push(await recordSignal('build_now_ventures', capacity.buildNowVentures));
    captured.push(await recordSignal('active_ventures', capacity.activeVentures));
    captured.push(await recordSignal('concurrency_limit', capacity.concurrencyLimit));
  }

  // Aggregate correlation strength + acceleration across all reports.
  const correlations = await SignalCorrelation.findAll();
  if (correlations.length) {
    const meanStrength = correlations.reduce((s, c) => s + Number(c.correlationStrength), 0) / correlations.length;
    const meanAccel = correlations.reduce((s, c) => s + Number(c.acceleration), 0) / correlations.length;
    captured.push(await recordSignal('mean_correlation_strength', Number(meanStrength.toFixed(3))));
    captured.push(await recordSignal('mean_acceleration', Number(meanAccel.toFixed(3))));
  }

  // Mean execution readiness across all ventures (proxy for portfolio health).
  const readinessRows = await ExecutionReadiness.findAll();
  if (readinessRows.length) {
    const meanReadiness = readinessRows.reduce(
      (s, r) => s + Number(r.executionReadinessScore || 0), 0,
    ) / readinessRows.length;
    captured.push(await recordSignal('mean_execution_readiness', Number(meanReadiness.toFixed(2))));
  }

  return { captured: captured.length };
}

// Read a single signal's time series over a window.
async function getSignalTimeline(key, { scope = 'portfolio', days = 90 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await SignalHistory.findAll({
    where: { signalKey: key, scope, computedAt: { [Op.gte]: since } },
    order: [['computed_at', 'ASC']],
  });
  return rows.map((r) => ({ at: r.computedAt, value: Number(r.signalValue) }));
}

// Compose timelines for an explicit key list (the observatory dashboard
// fetches a fixed set).
async function getPortfolioTimelines({ days = 90 } = {}) {
  const keys = [
    'staffing_pressure', 'infra_pressure', 'build_now_ventures', 'active_ventures',
    'mean_correlation_strength', 'mean_acceleration', 'mean_execution_readiness',
  ];
  const out = {};
  for (const k of keys) {
    // eslint-disable-next-line no-await-in-loop
    out[k] = await getSignalTimeline(k, { days });
  }
  return out;
}

module.exports = {
  recordSignal,
  snapshotPortfolioSignals,
  getSignalTimeline,
  getPortfolioTimelines,
};
