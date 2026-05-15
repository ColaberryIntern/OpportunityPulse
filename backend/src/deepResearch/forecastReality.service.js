// Deep Research Phase 6 — forecast-vs-reality analytics.
//
// MEASURE-ONLY. Never re-tunes any model. Compares old forecast rows
// against what the system later observed and writes one forecast_accuracy
// row per (forecast_kind, scope, scope_id, snapshot).
//
// Forecast kinds:
//   readiness  — predicted readiness vs. actual readiness now
//   timeline   — predicted breakeven / horizon vs. lifecycle reality
//   staffing   — predicted staffing pressure vs. observed
//   roi        — projected ROI vs. revenue-stage progression (qualitative)
//
// "Actuals" are derived from current Phase 3/4/5 state — there is no
// "ground truth" service. We classify each predicted-vs-actual pair as
// accurate | optimistic | pessimistic | unknown.

const {
  PredictiveCapacity, ResourceCapacitySnapshot, ExecutionReadiness, VentureIdea,
  RoiForecast, ForecastAccuracy,
} = require('../models');

const TOLERANCE_FRACTION = 0.15; // within +/-15% counts as accurate

function classifyDelta(predicted, actual) {
  if (predicted == null || actual == null) return { delta: null, fraction: null, classification: 'unknown' };
  const delta = Number(actual) - Number(predicted);
  const denom = Math.max(1, Math.abs(Number(predicted)));
  const fraction = delta / denom;
  if (Math.abs(fraction) <= TOLERANCE_FRACTION) {
    return { delta: Number(delta.toFixed(3)), fraction: Number(fraction.toFixed(3)), classification: 'accurate' };
  }
  if (fraction > 0) {
    // Actual > predicted — depending on the metric this is good or bad. The
    // caller decides what "optimistic" means; we just label direction.
    return { delta: Number(delta.toFixed(3)), fraction: Number(fraction.toFixed(3)), classification: 'pessimistic' };
  }
  return { delta: Number(delta.toFixed(3)), fraction: Number(fraction.toFixed(3)), classification: 'optimistic' };
}

async function compareStaffingForecast() {
  const latestForecast = await PredictiveCapacity.findOne({
    where: { horizonDays: 30 }, order: [['computed_at', 'DESC']],
  });
  const latestActual = await ResourceCapacitySnapshot.findOne({ order: [['created_at', 'DESC']] });
  if (!latestForecast || !latestActual) return null;
  const predicted = Number(latestForecast.projectedStaffingPressure || 0);
  const actual = Number(latestActual.staffingPressure || 0);
  const cls = classifyDelta(predicted, actual);
  return {
    forecastKind: 'staffing', scope: 'portfolio', scopeId: null,
    predictedValue: predicted, actualValue: actual,
    deltaAbsolute: cls.delta, deltaFraction: cls.fraction,
    classification: cls.classification,
    metadata: {
      forecast_computed_at: latestForecast.computedAt,
      actual_captured_at: latestActual.createdAt,
      horizon_days: 30,
    },
  };
}

async function compareReadinessForecast() {
  // Forecast: the readiness assessment captured >=14 days ago.
  // Actual: the latest readiness score for the same venture.
  const allReadiness = await ExecutionReadiness.findAll({ order: [['updated_at', 'ASC']] });
  if (allReadiness.length === 0) return [];
  const byVenture = new Map();
  for (const r of allReadiness) {
    if (!byVenture.has(r.ventureIdeaId)) byVenture.set(r.ventureIdeaId, []);
    byVenture.get(r.ventureIdeaId).push(r);
  }
  const rows = [];
  for (const [ventureId, list] of byVenture.entries()) {
    if (list.length < 2) continue;
    const sorted = list.slice().sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const predicted = Number(first.executionReadinessScore || 0);
    const actual = Number(last.executionReadinessScore || 0);
    const cls = classifyDelta(predicted, actual);
    rows.push({
      forecastKind: 'readiness', scope: 'venture', scopeId: ventureId,
      predictedValue: predicted, actualValue: actual,
      deltaAbsolute: cls.delta, deltaFraction: cls.fraction,
      classification: cls.classification,
      metadata: { first_assessed_at: first.updatedAt, last_assessed_at: last.updatedAt },
    });
  }
  return rows;
}

async function compareRoiForecast() {
  const forecasts = await RoiForecast.findAll({ where: { scope: 'venture' } });
  const ventures = await VentureIdea.findAll();
  const ventureMap = new Map(ventures.map((v) => [v.id, v]));
  const PROGRESSED = new Set(['planning_mvp', 'building', 'validating', 'launching', 'monitoring']);
  const rows = [];
  for (const f of forecasts) {
    const v = ventureMap.get(f.ventureIdeaId);
    if (!v) continue;
    // Qualitative: classify against lifecycle progression direction.
    const reachedRevenueStage = PROGRESSED.has(v.lifecycleState);
    const predicted = Number(f.projectedRoi12mo || 0);
    const actual = reachedRevenueStage ? predicted : 0; // proxy: no progression == 0 realized ROI
    const cls = classifyDelta(predicted, actual);
    rows.push({
      forecastKind: 'roi', scope: 'venture', scopeId: v.id,
      predictedValue: predicted, actualValue: actual,
      deltaAbsolute: cls.delta, deltaFraction: cls.fraction,
      classification: predicted === 0 ? 'unknown' : cls.classification,
      metadata: {
        forecast_scenario: f.scenario,
        venture_lifecycle: v.lifecycleState,
        reached_revenue_stage: reachedRevenueStage,
      },
    });
  }
  return rows;
}

async function compareTimelineForecast() {
  // Predicted: breakeven_months on the roi forecast.
  // Actual: lifecycle progression — if the venture is still pre-launch and
  // half the breakeven horizon has elapsed since the forecast, flag delta.
  const forecasts = await RoiForecast.findAll({ where: { scope: 'venture' } });
  const ventures = await VentureIdea.findAll();
  const ventureMap = new Map(ventures.map((v) => [v.id, v]));
  const PROGRESSED = new Set(['launching', 'monitoring']);
  const rows = [];
  for (const f of forecasts) {
    const v = ventureMap.get(f.ventureIdeaId);
    if (!v) continue;
    if (!f.breakevenMonths) continue;
    const predicted = Number(f.breakevenMonths);
    const monthsSinceForecast = (Date.now() - new Date(f.createdAt).getTime())
      / (1000 * 60 * 60 * 24 * 30);
    const actual = PROGRESSED.has(v.lifecycleState) ? monthsSinceForecast : predicted * 2;
    const cls = classifyDelta(predicted, actual);
    rows.push({
      forecastKind: 'timeline', scope: 'venture', scopeId: v.id,
      predictedValue: Number(predicted.toFixed(2)),
      actualValue: Number(actual.toFixed(2)),
      deltaAbsolute: cls.delta, deltaFraction: cls.fraction,
      classification: PROGRESSED.has(v.lifecycleState) ? cls.classification : 'optimistic',
      metadata: {
        venture_lifecycle: v.lifecycleState,
        months_since_forecast: Number(monthsSinceForecast.toFixed(2)),
      },
    });
  }
  return rows;
}

async function refreshForecastAccuracy() {
  const rows = [];
  const staffing = await compareStaffingForecast();
  if (staffing) rows.push(staffing);
  rows.push(...await compareReadinessForecast());
  rows.push(...await compareRoiForecast());
  rows.push(...await compareTimelineForecast());
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await ForecastAccuracy.create({
      forecastKind: r.forecastKind, scope: r.scope, scopeId: r.scopeId,
      predictedValue: r.predictedValue, actualValue: r.actualValue,
      deltaAbsolute: r.deltaAbsolute, deltaFraction: r.deltaFraction,
      classification: r.classification, metadata: r.metadata,
    });
  }
  return { evaluated: rows.length, results: rows };
}

async function getLatestAccuracy({ days = 90 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await ForecastAccuracy.findAll({
    where: {}, order: [['computed_at', 'DESC']],
  });
  const recent = rows.filter((r) => new Date(r.computedAt) >= since);
  // Bucket by forecast_kind + classification, return counts + samples.
  const byKind = {};
  for (const r of recent) {
    const k = r.forecastKind;
    if (!byKind[k]) byKind[k] = { total: 0, accurate: 0, optimistic: 0, pessimistic: 0, unknown: 0, samples: [] };
    byKind[k].total += 1;
    byKind[k][r.classification] = (byKind[k][r.classification] || 0) + 1;
    if (byKind[k].samples.length < 8) byKind[k].samples.push(r.toJSON());
  }
  const summary = Object.entries(byKind).map(([kind, info]) => ({
    forecast_kind: kind,
    total: info.total,
    accurate: info.accurate,
    optimistic: info.optimistic,
    pessimistic: info.pessimistic,
    unknown: info.unknown,
    accuracy: info.total > 0 ? Number((info.accurate / info.total).toFixed(3)) : null,
    samples: info.samples,
  }));
  return { days, summary };
}

module.exports = {
  TOLERANCE_FRACTION, classifyDelta,
  compareStaffingForecast, compareReadinessForecast,
  compareRoiForecast, compareTimelineForecast,
  refreshForecastAccuracy, getLatestAccuracy,
};
