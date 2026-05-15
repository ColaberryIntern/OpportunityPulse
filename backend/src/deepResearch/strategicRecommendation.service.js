// Deep Research Phase 6 — strategic recommendation engine.
//
// Portfolio-level recommendations (one level above per-venture interventions).
// MEASURE + RECOMMEND ONLY — never modifies scoring, never moves lifecycle.
//
// Recommendation types:
//   portfolio_rebalance         — readiness distribution skewed too BUILD_NOW heavy
//   execution_pacing            — velocity dropped while queue grew
//   infrastructure_consolidation — overlap clusters above the threshold
//   venture_acceleration        — high-readiness ventures stuck in evaluating
//   monitoring                  — many low-readiness or stagnating ventures
//
// Inputs are persisted analytics rows (no recomputation here).

const { Op } = require('sequelize');
const {
  VentureIdea, ExecutionReadiness, InfrastructureOverlap,
  VentureLifecycleEvent, ResourceCapacitySnapshot,
  PortfolioScore, StrategicRecommendation,
} = require('../models');

const SEVERITY_HIGH = 80;
const SEVERITY_MED = 55;
const SEVERITY_LOW = 30;

const DAY_MS = 86400000;

function decisionFromReadiness(er) {
  return (er.breakdown && er.breakdown.decision && er.breakdown.decision.decision) || null;
}

async function rebalanceRec(readinessRows, ventures) {
  const activeReadiness = readinessRows.filter((er) => {
    const v = ventures.find((x) => x.id === er.ventureIdeaId);
    return v && v.lifecycleState !== 'archived' && v.lifecycleState !== 'monitoring';
  });
  if (activeReadiness.length === 0) return null;
  const buckets = { BUILD_NOW: 0, BUILD_SOON: 0, MONITOR: 0, TOO_EARLY: 0, OVERSATURATED: 0, HIGH_RISK: 0, NEEDS_VALIDATION: 0 };
  for (const er of activeReadiness) {
    const d = decisionFromReadiness(er);
    if (d && buckets[d] != null) buckets[d] += 1;
  }
  const buildHeavy = buckets.BUILD_NOW + buckets.BUILD_SOON;
  const fraction = buildHeavy / activeReadiness.length;
  if (fraction < 0.7) return null;
  return {
    type: 'portfolio_rebalance',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_MED + Math.round(fraction * 40)),
    title: `Portfolio skewed BUILD-heavy: ${Math.round(fraction * 100)}% of active ventures`,
    rationale: `${buildHeavy} of ${activeReadiness.length} active ventures are BUILD_NOW/BUILD_SOON. `
      + 'Without monitor/validation candidates in reserve the funnel narrows. Add adjacent ideas to '
      + 'the research pipeline.',
    supportingMetrics: {
      active_ventures: activeReadiness.length,
      build_heavy: buildHeavy,
      buckets,
      fraction: Number(fraction.toFixed(3)),
    },
    relatedVentureIds: [],
  };
}

async function pacingRec() {
  // Compare 7d transitions to 30d transitions normalized to 7d.
  const events = await VentureLifecycleEvent.findAll({ order: [['created_at', 'DESC']] });
  const now = Date.now();
  const last7 = events.filter((e) => now - new Date(e.createdAt).getTime() <= 7 * DAY_MS).length;
  const last30 = events.filter((e) => now - new Date(e.createdAt).getTime() <= 30 * DAY_MS).length;
  const baselinePer7 = last30 / 30 * 7;
  if (baselinePer7 < 1) return null; // no meaningful baseline
  const ratio = last7 / baselinePer7;
  if (ratio >= 0.6) return null; // not a meaningful slowdown
  return {
    type: 'execution_pacing',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_MED + Math.round((1 - ratio) * 40)),
    title: `Execution pace slowing — last 7d at ${Math.round(ratio * 100)}% of 30d baseline`,
    rationale: `Lifecycle transitions dropped: ${last7} in the last 7d vs ~${baselinePer7.toFixed(1)} `
      + 'expected from the 30d baseline. Identify the bottleneck (staffing, decisions, deployment).',
    supportingMetrics: {
      transitions_7d: last7,
      transitions_30d: last30,
      expected_7d: Number(baselinePer7.toFixed(2)),
      ratio: Number(ratio.toFixed(3)),
    },
    relatedVentureIds: [],
  };
}

async function consolidationRec() {
  const overlaps = await InfrastructureOverlap.findAll();
  if (overlaps.length === 0) return null;
  const heavy = overlaps.filter((o) => Number(o.score || 0) >= 3); // 3+ ventures sharing
  if (heavy.length === 0) return null;
  const total = heavy.reduce((acc, o) => acc + (Array.isArray(o.ventureIdeaIds) ? o.ventureIdeaIds.length : 0), 0);
  return {
    type: 'infrastructure_consolidation',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_LOW + heavy.length * 15),
    title: `Consolidate ${heavy.length} shared-infrastructure cluster${heavy.length === 1 ? '' : 's'}`,
    rationale: `${heavy.length} infrastructure overlap cluster${heavy.length === 1 ? '' : 's'} touch `
      + `${total} venture-rows. Building once and sharing across these reduces duplicate engineering.`,
    supportingMetrics: { cluster_count: heavy.length, total_venture_links: total },
    relatedVentureIds: heavy.flatMap((o) => (Array.isArray(o.ventureIdeaIds) ? o.ventureIdeaIds : [])),
  };
}

async function accelerationRec(readinessRows, ventures) {
  // High-readiness (>= 75) ventures stuck in evaluating / approved.
  const STALLABLE = new Set(['evaluating', 'approved']);
  const candidates = [];
  for (const er of readinessRows) {
    const score = Number(er.executionReadinessScore || 0);
    if (score < 75) continue;
    const v = ventures.find((x) => x.id === er.ventureIdeaId);
    if (!v || !STALLABLE.has(v.lifecycleState)) continue;
    candidates.push({ id: v.id, title: v.title, score, state: v.lifecycleState });
  }
  if (candidates.length === 0) return null;
  return {
    type: 'venture_acceleration',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_MED + candidates.length * 8),
    title: `Accelerate ${candidates.length} high-readiness venture${candidates.length === 1 ? '' : 's'}`,
    rationale: `${candidates.length} venture${candidates.length === 1 ? ' has' : 's have'} readiness `
      + `>= 75 but ${candidates.length === 1 ? 'is' : 'are'} still in evaluating/approved. Move into `
      + 'requirements / planning_mvp to capitalize on the signal.',
    supportingMetrics: { count: candidates.length, ventures: candidates },
    relatedVentureIds: candidates.map((c) => c.id),
  };
}

async function monitoringRec(readinessRows, ventures) {
  // If > 40% of evaluated ventures are low-readiness (<= 40) and not yet
  // archived, the portfolio is bottom-loaded and signal exhaustion is a risk.
  const evaluated = readinessRows.filter((er) => {
    const v = ventures.find((x) => x.id === er.ventureIdeaId);
    return v && v.lifecycleState !== 'archived';
  });
  if (evaluated.length < 4) return null;
  const low = evaluated.filter((er) => Number(er.executionReadinessScore || 0) <= 40).length;
  const fraction = low / evaluated.length;
  if (fraction < 0.4) return null;
  return {
    type: 'monitoring',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_MED + Math.round(fraction * 30)),
    title: `${Math.round(fraction * 100)}% of evaluated ventures are low-readiness`,
    rationale: `${low} of ${evaluated.length} evaluated ventures have readiness <= 40. `
      + 'Move the cold ones into MONITOR explicitly so capacity isn\'t fractured across weak signals.',
    supportingMetrics: { evaluated: evaluated.length, low_readiness: low, fraction: Number(fraction.toFixed(3)) },
    relatedVentureIds: [],
  };
}

async function computeRecommendations() {
  const [ventures, readinessRows] = await Promise.all([
    VentureIdea.findAll(),
    ExecutionReadiness.findAll(),
  ]);
  const out = [];
  for (const fn of [
    () => rebalanceRec(readinessRows, ventures),
    () => pacingRec(),
    () => consolidationRec(),
    () => accelerationRec(readinessRows, ventures),
    () => monitoringRec(readinessRows, ventures),
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const rec = await fn();
    if (rec) out.push(rec);
  }
  return out;
}

async function refreshRecommendations() {
  const recs = await computeRecommendations();
  const persisted = [];
  for (const rec of recs) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await StrategicRecommendation.findOne({
      where: { recommendationType: rec.type, title: rec.title, status: 'pending' },
    });
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
      await existing.update({
        severity: rec.severity, rationale: rec.rationale,
        supportingMetrics: rec.supportingMetrics, relatedVentureIds: rec.relatedVentureIds,
      });
      persisted.push(existing.toJSON());
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const row = await StrategicRecommendation.create({
      recommendationType: rec.type,
      severity: rec.severity,
      title: rec.title,
      rationale: rec.rationale,
      supportingMetrics: rec.supportingMetrics,
      relatedVentureIds: rec.relatedVentureIds,
      status: 'pending',
    });
    persisted.push(row.toJSON());
  }
  return { generated: recs.length, persisted: persisted.length, recommendations: persisted };
}

async function listPending() {
  const rows = await StrategicRecommendation.findAll({
    where: { status: 'pending' }, order: [['severity', 'DESC'], ['created_at', 'DESC']],
  });
  return rows.map((r) => r.toJSON());
}

async function listAll({ limit = 200 } = {}) {
  const rows = await StrategicRecommendation.findAll({
    order: [['created_at', 'DESC']], limit,
  });
  return rows.map((r) => r.toJSON());
}

async function updateStatus(id, status, actor = null) {
  if (!['acknowledged', 'dismissed'].includes(status)) {
    const err = new Error(`Invalid status ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await StrategicRecommendation.findByPk(id);
  if (!row) { const err = new Error(`Strategic recommendation ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.update({ status, acknowledgedBy: actor, acknowledgedAt: new Date() });
  return row.toJSON();
}

module.exports = {
  SEVERITY_HIGH, SEVERITY_MED, SEVERITY_LOW,
  decisionFromReadiness,
  rebalanceRec, pacingRec, consolidationRec, accelerationRec, monitoringRec,
  computeRecommendations, refreshRecommendations,
  listPending, listAll, updateStatus,
};
