// Deep Research Phase 5 — temporal intelligence engine.
//
// Deterministic. Captures key metrics into temporal_snapshots and answers
// "is this strengthening or weakening over time?" by computing deltas
// across configurable lookback windows. The classification is auditable
// math, not a model opinion.
//
// Handles low-data gracefully: classifications return 'insufficient_data'
// when only a single snapshot exists in the window.

const { Op } = require('sequelize');
const { TemporalSnapshot } = require('../models');

const MOVEMENT_CLASSES = ['accelerating', 'strengthening', 'stable', 'weakening', 'decelerating', 'insufficient_data'];

// Thresholds (fractional change vs prior value) — env-overridable.
const STRENGTHEN_THRESHOLD = Number(process.env.DEEP_RESEARCH_STRENGTHEN_THRESHOLD) || 0.10;
const ACCELERATE_THRESHOLD = Number(process.env.DEEP_RESEARCH_ACCELERATE_THRESHOLD) || 0.30;

// Record one metric snapshot.
async function recordMetric(key, value, { scope = 'portfolio', scopeId = null, metadata = {} } = {}) {
  return TemporalSnapshot.create({
    metricKey: key,
    metricValue: value == null ? null : Number(value),
    scope,
    scopeId,
    metadata,
  });
}

// Pure: classify a delta fraction (e.g. +0.4 = 40% up). Handles null inputs.
function classifyDelta(deltaFraction) {
  if (deltaFraction == null || Number.isNaN(deltaFraction)) return 'insufficient_data';
  const v = Number(deltaFraction);
  if (v >= ACCELERATE_THRESHOLD) return 'accelerating';
  if (v >= STRENGTHEN_THRESHOLD) return 'strengthening';
  if (v <= -ACCELERATE_THRESHOLD) return 'decelerating';
  if (v <= -STRENGTHEN_THRESHOLD) return 'weakening';
  return 'stable';
}

// Compute movement for one metric across a lookback period.
async function getMetricMovement(key, { scope = 'portfolio', scopeId = null, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const where = { metricKey: key, scope, snapshotAt: { [Op.gte]: since } };
  if (scopeId != null) where.scopeId = scopeId;
  const rows = await TemporalSnapshot.findAll({ where, order: [['snapshot_at', 'ASC']] });
  if (rows.length === 0) {
    return {
      metric_key: key, samples: 0, first: null, last: null,
      delta_absolute: null, delta_fraction: null, classification: 'insufficient_data',
    };
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstVal = Number(first.metricValue);
  const lastVal = Number(last.metricValue);
  // Need at least two distinct points to compute movement.
  if (rows.length < 2 || !Number.isFinite(firstVal) || !Number.isFinite(lastVal)) {
    return {
      metric_key: key, samples: rows.length, first: firstVal, last: lastVal,
      delta_absolute: null, delta_fraction: null, classification: 'insufficient_data',
    };
  }
  const deltaAbs = lastVal - firstVal;
  const deltaFrac = firstVal === 0 ? (lastVal > 0 ? 1 : 0) : deltaAbs / Math.abs(firstVal);
  return {
    metric_key: key,
    samples: rows.length,
    first: firstVal,
    last: lastVal,
    period_days: days,
    delta_absolute: Number(deltaAbs.toFixed(3)),
    delta_fraction: Number(deltaFrac.toFixed(3)),
    classification: classifyDelta(deltaFrac),
  };
}

// Summary across an explicit metric list. Each entry is the same shape as
// getMetricMovement returns.
async function summarizeMovements(keys, { days = 30 } = {}) {
  const out = [];
  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop
    out.push(await getMetricMovement(key, { days }));
  }
  return out;
}

module.exports = {
  MOVEMENT_CLASSES,
  STRENGTHEN_THRESHOLD,
  ACCELERATE_THRESHOLD,
  recordMetric,
  classifyDelta,
  getMetricMovement,
  summarizeMovements,
};
