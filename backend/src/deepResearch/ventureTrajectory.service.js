// Deep Research Phase 5 — per-venture trajectory intelligence.
//
// Deterministic. For each venture, compares time-series snapshots over a
// configurable window and classifies the trajectory:
//   strengthening | accelerating | stable | weakening | stagnating | unknown
//
// Inputs are existing time-series tables (confidence_history, portfolio_scores,
// venture_lifecycle_events) + the current execution readiness — no AI.
// Returns "unknown" gracefully when there's not enough data.

const { Op } = require('sequelize');
const {
  VentureIdea, ConfidenceHistory, PortfolioScore, ExecutionReadiness,
  VentureLifecycleEvent, VentureTrajectory,
} = require('../models');

const CLASSIFICATIONS = ['strengthening', 'accelerating', 'stable', 'weakening', 'stagnating', 'unknown'];

const ACCELERATE_DELTA = 0.18; // both confidence (0-1) and normalized score (0-1)
const STRENGTHEN_DELTA = 0.06;
const STAGNANT_DAYS = 30; // no lifecycle transitions for this long
const STAGNANT_DELTA_BAND = 0.03; // and basically no movement

// Classify a venture trajectory from its computed deltas.
function classifyTrajectory({
  confidenceDelta, scoreDelta01, lifecycleVelocity, periodDays,
}) {
  // No data at all → unknown.
  if (confidenceDelta == null && scoreDelta01 == null && lifecycleVelocity == null) return 'unknown';

  const cd = confidenceDelta == null ? 0 : Number(confidenceDelta);
  const sd = scoreDelta01 == null ? 0 : Number(scoreDelta01);
  const velocity = lifecycleVelocity == null ? 0 : Number(lifecycleVelocity);
  const blended = (cd + sd) / 2;

  if (Math.abs(cd) < STAGNANT_DELTA_BAND && Math.abs(sd) < STAGNANT_DELTA_BAND
      && velocity === 0 && periodDays >= STAGNANT_DAYS) {
    return 'stagnating';
  }
  if (blended >= ACCELERATE_DELTA && velocity > 0) return 'accelerating';
  if (blended >= STRENGTHEN_DELTA) return 'strengthening';
  if (blended <= -ACCELERATE_DELTA) return 'weakening';
  if (blended <= -STRENGTHEN_DELTA) return 'weakening';
  return 'stable';
}

// Build a per-venture confidence delta + sample count map.
async function buildConfidenceDeltas(ventureIds, sinceDate) {
  const rows = await ConfidenceHistory.findAll({
    where: { ventureIdeaId: { [Op.in]: ventureIds }, computedAt: { [Op.gte]: sinceDate } },
    order: [['computed_at', 'ASC']],
  });
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.ventureIdeaId)) map.set(r.ventureIdeaId, []);
    map.get(r.ventureIdeaId).push(Number(r.confidence));
  }
  const result = new Map();
  for (const [id, series] of map) {
    if (series.length < 2) { result.set(id, { delta: null, samples: series.length }); continue; }
    result.set(id, {
      delta: Number((series[series.length - 1] - series[0]).toFixed(3)),
      samples: series.length,
    });
  }
  return result;
}

// Build a per-venture portfolio score delta from portfolio_scores history.
async function buildScoreDeltas(ventureIds, sinceDate) {
  const rows = await PortfolioScore.findAll({
    where: { ventureIdeaId: { [Op.in]: ventureIds }, createdAt: { [Op.gte]: sinceDate } },
    order: [['created_at', 'ASC']],
  });
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.ventureIdeaId)) map.set(r.ventureIdeaId, []);
    map.get(r.ventureIdeaId).push(Number(r.portfolioScore));
  }
  const result = new Map();
  for (const [id, series] of map) {
    if (series.length < 2) { result.set(id, { delta: null, delta01: null, samples: series.length }); continue; }
    const absDelta = series[series.length - 1] - series[0];
    result.set(id, {
      delta: Number(absDelta.toFixed(2)),
      // Normalize 0-100 score delta to 0-1 for the classifier.
      delta01: Number((absDelta / 100).toFixed(3)),
      samples: series.length,
    });
  }
  return result;
}

// Lifecycle velocity = transitions per day in the window.
async function buildLifecycleVelocities(ventureIds, sinceDate, periodDays) {
  const events = await VentureLifecycleEvent.findAll({
    where: { ventureIdeaId: { [Op.in]: ventureIds }, createdAt: { [Op.gte]: sinceDate } },
    attributes: ['ventureIdeaId', 'createdAt'],
  });
  const counts = new Map();
  for (const e of events) counts.set(e.ventureIdeaId, (counts.get(e.ventureIdeaId) || 0) + 1);
  const result = new Map();
  for (const id of ventureIds) {
    const c = counts.get(id) || 0;
    result.set(id, periodDays > 0 ? Number((c / periodDays).toFixed(3)) : 0);
  }
  return result;
}

// Compute trajectories for every active venture over the period. Persists
// one venture_trajectories row each + returns the results.
async function classifyAllTrajectories({ periodDays = 30 } = {}) {
  const sinceDate = new Date(Date.now() - periodDays * 86400000);
  const ventures = await VentureIdea.findAll({
    where: { lifecycleState: { [Op.ne]: 'archived' } },
  });
  const ids = ventures.map((v) => v.id);
  if (ids.length === 0) return { trajectories: [], computed_at: new Date() };

  const [confidenceMap, scoreMap, velocityMap, readinessRows] = await Promise.all([
    buildConfidenceDeltas(ids, sinceDate),
    buildScoreDeltas(ids, sinceDate),
    buildLifecycleVelocities(ids, sinceDate, periodDays),
    ExecutionReadiness.findAll({ where: { ventureIdeaId: { [Op.in]: ids } } }),
  ]);
  const readinessByVenture = new Map(readinessRows.map((r) => [r.ventureIdeaId, r]));

  const trajectories = [];
  for (const v of ventures) {
    const c = confidenceMap.get(v.id) || { delta: null };
    const s = scoreMap.get(v.id) || { delta: null, delta01: null };
    const velocity = velocityMap.get(v.id) || 0;
    const er = readinessByVenture.get(v.id);
    const readinessDelta = er ? Number(er.executionReadinessScore) - 50 : null;

    const classification = classifyTrajectory({
      confidenceDelta: c.delta,
      scoreDelta01: s.delta01,
      lifecycleVelocity: velocity,
      periodDays,
    });

    const partsFor = (k, v2, suffix) => (v2 == null ? null : `${k} ${v2 >= 0 ? '+' : ''}${v2}${suffix}`);
    const parts = [
      partsFor('confidence', c.delta, ''),
      partsFor('score', s.delta, ''),
      `${velocity}/day transitions`,
    ].filter(Boolean).join(', ');
    const rationale = `${classification} — over ${periodDays} days: ${parts}.`;

    // eslint-disable-next-line no-await-in-loop
    await VentureTrajectory.create({
      ventureIdeaId: v.id,
      classification,
      scoreDelta: s.delta,
      confidenceDelta: c.delta,
      readinessDelta,
      lifecycleVelocity: velocity,
      periodDays,
      rationale,
      metadata: {
        confidence_samples: c.samples || 0,
        score_samples: s.samples || 0,
      },
    });
    trajectories.push({
      venture_idea_id: v.id,
      title: v.title,
      lifecycle_state: v.lifecycleState,
      classification,
      score_delta: s.delta,
      confidence_delta: c.delta,
      readiness_delta: readinessDelta,
      lifecycle_velocity: velocity,
      period_days: periodDays,
      rationale,
    });
  }
  return { trajectories, computed_at: new Date() };
}

// Read the latest trajectory per venture.
async function getLatestTrajectories() {
  const rows = await VentureTrajectory.findAll({ order: [['computed_at', 'DESC']] });
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.ventureIdeaId)) seen.set(r.ventureIdeaId, r.toJSON());
  return Array.from(seen.values());
}

module.exports = {
  CLASSIFICATIONS,
  ACCELERATE_DELTA,
  STRENGTHEN_DELTA,
  STAGNANT_DAYS,
  classifyTrajectory,
  buildConfidenceDeltas,
  buildScoreDeltas,
  buildLifecycleVelocities,
  classifyAllTrajectories,
  getLatestTrajectories,
};
