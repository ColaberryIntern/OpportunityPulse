// Deep Research Phase 6 — venture health intelligence.
//
// Per-venture composite health classification + history. MEASURE-ONLY. Never
// auto-pauses, never re-decides — only emits a typed health row with the
// signals that drove it, so a human can act.
//
// Classifications (mutually exclusive):
//   healthy        — recent movement, low decay, no overload, no drift
//   strengthening  — readiness trend rising or stuck → progressed in window
//   at_risk        — confidence dropped or readiness fell or trajectory='declining'
//   overloaded     — venture is in a heavy infra cluster + active stage
//   stagnating     — stuck > stall threshold in a STALLABLE state
//   declining      — multiple at_risk signals OR trajectory='declining' for >= 30d
//
// Signals weighted into a 0-100 health score (informational, not gated).

const {
  VentureIdea, ExecutionReadiness, ConfidenceHistory,
  VentureLifecycleEvent, VentureTrajectory, InfrastructureOverlap,
  VentureHealthHistory,
} = require('../models');

const DAY_MS = 86400000;
const STALL_DAYS = Number(process.env.DEEP_RESEARCH_STALL_DAYS) || 30;
const STALLABLE = new Set(['evaluating', 'approved', 'generating_requirements', 'planning_mvp']);
const ACTIVE_STATES = new Set([
  'evaluating', 'approved', 'generating_requirements',
  'planning_mvp', 'building', 'validating', 'launching',
]);

function computeStallDays(eventsForVenture, ventureCreatedAt, now) {
  const sorted = eventsForVenture.slice().sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  const last = sorted[0] ? new Date(sorted[0].createdAt).getTime() : new Date(ventureCreatedAt).getTime();
  return Math.floor((now - last) / DAY_MS);
}

function readinessDelta(historyForVenture) {
  // Last two confidence readings.
  const sorted = historyForVenture.slice().sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  if (sorted.length < 2) return 0;
  return Number(sorted[0].confidence) - Number(sorted[1].confidence);
}

function classify(signals) {
  if (signals.trajectory === 'declining' && signals.confidence_delta < -0.1) return 'declining';
  if (signals.confidence_delta <= -0.15 || signals.trajectory === 'declining') return 'at_risk';
  if (signals.stall_days >= STALL_DAYS && STALLABLE.has(signals.state)) return 'stagnating';
  if (signals.overlap_count >= 3 && ACTIVE_STATES.has(signals.state)) return 'overloaded';
  if (signals.trajectory === 'rising' || signals.confidence_delta >= 0.1) return 'strengthening';
  return 'healthy';
}

function scoreFromSignals(signals, classification) {
  // 100 = perfect, 0 = critical. Each signal subtracts; classification anchors.
  const anchors = {
    healthy: 88, strengthening: 92, at_risk: 45, overloaded: 55,
    stagnating: 40, declining: 25,
  };
  let s = anchors[classification] || 60;
  if (signals.stall_days >= STALL_DAYS) s -= Math.min(20, (signals.stall_days - STALL_DAYS) * 0.5);
  if (signals.confidence_delta < 0) s -= Math.min(15, Math.abs(signals.confidence_delta) * 100 * 0.5);
  if (signals.overlap_count >= 3) s -= 5;
  return Math.max(0, Math.min(100, Math.round(s * 100) / 100));
}

function suggestedAction(classification) {
  switch (classification) {
    case 'healthy': return null;
    case 'strengthening': return 'Continue execution; consider scaling resources.';
    case 'at_risk': return 'Re-run the readiness assessment and validate underlying signals.';
    case 'overloaded': return 'Sequence after current shared-infrastructure cluster releases capacity.';
    case 'stagnating': return 'Force a lifecycle decision: reassess, pause, or archive.';
    case 'declining': return 'Pause or archive — multiple negative signals reinforce each other.';
    default: return null;
  }
}

async function computeAll({ now = Date.now() } = {}) {
  const [ventures, readinessRows, history, lifecycle, trajectories, overlaps] = await Promise.all([
    VentureIdea.findAll(),
    ExecutionReadiness.findAll(),
    ConfidenceHistory.findAll(),
    VentureLifecycleEvent.findAll(),
    VentureTrajectory.findAll(),
    InfrastructureOverlap.findAll(),
  ]);
  const eventsByV = new Map();
  for (const e of lifecycle) {
    if (!eventsByV.has(e.ventureIdeaId)) eventsByV.set(e.ventureIdeaId, []);
    eventsByV.get(e.ventureIdeaId).push(e);
  }
  const historyByV = new Map();
  for (const h of history) {
    if (!historyByV.has(h.ventureIdeaId)) historyByV.set(h.ventureIdeaId, []);
    historyByV.get(h.ventureIdeaId).push(h);
  }
  const trajectoryByV = new Map();
  for (const t of trajectories) {
    const existing = trajectoryByV.get(t.ventureIdeaId);
    if (!existing || new Date(t.computedAt) > new Date(existing.computedAt)) {
      trajectoryByV.set(t.ventureIdeaId, t);
    }
  }
  const overlapCountByV = new Map();
  for (const o of overlaps) {
    const ids = Array.isArray(o.ventureIdeaIds) ? o.ventureIdeaIds : [];
    for (const id of ids) overlapCountByV.set(id, (overlapCountByV.get(id) || 0) + 1);
  }
  const results = [];
  for (const v of ventures) {
    if (v.lifecycleState === 'archived') continue;
    const er = readinessRows.find((r) => r.ventureIdeaId === v.id);
    const trajectory = trajectoryByV.get(v.id);
    const trajectoryClass = trajectory ? trajectory.classification : 'unknown';
    const signals = {
      state: v.lifecycleState,
      readiness_score: er ? Number(er.executionReadinessScore || 0) : null,
      confidence_delta: Number(readinessDelta(historyByV.get(v.id) || []).toFixed(3)),
      stall_days: computeStallDays(eventsByV.get(v.id) || [], v.createdAt, now),
      trajectory: trajectoryClass,
      overlap_count: overlapCountByV.get(v.id) || 0,
    };
    const classification = classify(signals);
    const score = scoreFromSignals(signals, classification);
    const suggested = suggestedAction(classification);
    const rationale = `${classification.toUpperCase()}: state=${signals.state}, `
      + `readiness=${signals.readiness_score == null ? '–' : signals.readiness_score}, `
      + `Δconfidence=${signals.confidence_delta.toFixed(2)}, stall=${signals.stall_days}d, `
      + `trajectory=${signals.trajectory}, overlaps=${signals.overlap_count}.`;
    results.push({
      venture_idea_id: v.id, title: v.title, signals,
      classification, score, suggested_intervention: suggested, rationale,
    });
  }
  return results;
}

async function refreshHealth() {
  const results = await computeAll();
  for (const r of results) {
    // eslint-disable-next-line no-await-in-loop
    await VentureHealthHistory.create({
      ventureIdeaId: r.venture_idea_id,
      healthClassification: r.classification,
      healthScore: r.score,
      signals: r.signals,
      rationale: r.rationale,
      suggestedIntervention: r.suggested_intervention,
      computedAt: new Date(),
    });
  }
  return { evaluated: results.length, results };
}

async function getLatestHealth() {
  // Latest row per venture.
  const rows = await VentureHealthHistory.findAll({ order: [['computed_at', 'DESC']] });
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.ventureIdeaId)) seen.set(r.ventureIdeaId, r.toJSON());
  return [...seen.values()];
}

async function getHealthHistory(ventureIdeaId, { limit = 50 } = {}) {
  const rows = await VentureHealthHistory.findAll({
    where: { ventureIdeaId }, order: [['computed_at', 'DESC']], limit,
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  STALL_DAYS, STALLABLE, ACTIVE_STATES,
  computeStallDays, readinessDelta, classify, scoreFromSignals, suggestedAction,
  computeAll, refreshHealth, getLatestHealth, getHealthHistory,
};
