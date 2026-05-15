// Deep Research Phase 6 — executive intervention engine.
//
// MEASURE + RECOMMEND ONLY. This service NEVER modifies scoring, NEVER moves
// a venture's lifecycle state, NEVER executes a recommendation. It reads from
// the persisted Phase 4/5 analytics and emits typed intervention rows that
// a human acknowledges or dismisses.
//
// Recommendation types:
//   hire                          — role demand exceeds supply
//   redistribute                  — uneven staffing load across active ventures
//   venture_pause                 — stalled ventures eating capacity
//   queue_pressure                — too many BUILD_NOWs vs concurrency limit
//   sequencing                    — high-dependency ventures running in parallel
//   ecosystem_diversification     — one ecosystem >= 50% of active ventures
//
// Each rec carries: type, severity (0-100), title, rationale, supporting
// metrics (so the user can audit the math), related venture IDs.

const { Op } = require('sequelize');
const {
  VentureIdea, ExecutionReadiness, ResourceCapacitySnapshot,
  EcosystemMetric, DependencyEdge, VentureLifecycleEvent,
  InterventionRecommendation,
} = require('../models');

const SEVERITY_HIGH = 85;
const SEVERITY_MED = 60;
const SEVERITY_LOW = 35;

const DAY_MS = 86400000;
const STALL_DAYS = Number(process.env.DEEP_RESEARCH_STALL_DAYS) || 30;

function findHireRecs(snapshot) {
  const recs = [];
  if (!snapshot) return recs;
  const roleDemand = snapshot.role_demand || snapshot.roleDemand || {};
  for (const [role, info] of Object.entries(roleDemand)) {
    if (info.deficit > 0) {
      const severity = info.supply === 0
        ? SEVERITY_HIGH
        : Math.min(SEVERITY_HIGH, SEVERITY_LOW + info.deficit * 15);
      recs.push({
        type: 'hire',
        severity,
        title: `Hire ${role} (deficit ${info.deficit})`,
        rationale: `${role} has ${info.demand} active venture demand vs ${info.supply} supply. `
          + `Closing this gap unblocks ${info.deficit} venture${info.deficit === 1 ? '' : 's'}.`,
        supportingMetrics: { role, demand: info.demand, supply: info.supply, deficit: info.deficit },
        relatedVentureIds: [],
      });
    }
  }
  return recs;
}

function findQueueRec(snapshot) {
  if (!snapshot) return null;
  const buildNow = snapshot.build_now_ventures || snapshot.buildNowVentures || 0;
  const concurrency = snapshot.concurrency_limit || snapshot.concurrencyLimit || 0;
  if (buildNow <= concurrency) return null;
  const over = buildNow - concurrency;
  return {
    type: 'queue_pressure',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_MED + over * 8),
    title: `Queue pressure: ${buildNow} BUILD_NOWs vs limit ${concurrency}`,
    rationale: `Active BUILD_NOW count (${buildNow}) exceeds concurrency limit (${concurrency}). `
      + `Either raise capacity or sequence ${over} venture${over === 1 ? '' : 's'} to a later wave.`,
    supportingMetrics: { build_now: buildNow, concurrency_limit: concurrency, over_by: over },
    relatedVentureIds: [],
  };
}

async function findRedistributionRec(snapshot, readinessRows, ventures) {
  if (!snapshot) return null;
  // Identify ventures whose staffing headcount is in the top quartile relative
  // to the rest of the active set — those are candidates to redistribute from.
  const active = readinessRows.filter((er) => {
    const v = ventures.find((x) => x.id === er.ventureIdeaId);
    return v && v.lifecycleState !== 'archived' && v.lifecycleState !== 'monitoring';
  });
  const heads = active.map((er) => Number(((er.staffing || {}).headcount) || 0));
  if (heads.length < 3) return null;
  const sorted = heads.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  if (max <= median * 1.5 || max < 3) return null;
  const heavy = active.filter((er) => Number(((er.staffing || {}).headcount) || 0) === max);
  return {
    type: 'redistribute',
    severity: SEVERITY_MED,
    title: `Redistribute staffing — top venture has ${max} heads vs median ${median}`,
    rationale: `One or more ventures are absorbing ${max} headcount while the median is ${median}. `
      + 'Rebalance to free capacity for queued BUILD_NOWs.',
    supportingMetrics: { max_heads: max, median_heads: median, heavy_count: heavy.length },
    relatedVentureIds: heavy.map((er) => er.ventureIdeaId),
  };
}

async function findVenturePauseRecs(ventures) {
  const recs = [];
  const now = Date.now();
  const STALLABLE = new Set(['evaluating', 'approved', 'generating_requirements', 'planning_mvp']);
  const stalled = [];
  for (const v of ventures) {
    if (!STALLABLE.has(v.lifecycleState)) continue;
    // eslint-disable-next-line no-await-in-loop
    const lastEvent = await VentureLifecycleEvent.findOne({
      where: { ventureIdeaId: v.id }, order: [['created_at', 'DESC']],
    });
    const last = lastEvent ? new Date(lastEvent.createdAt).getTime() : new Date(v.createdAt).getTime();
    const stuckDays = Math.floor((now - last) / DAY_MS);
    if (stuckDays >= STALL_DAYS) stalled.push({ id: v.id, title: v.title, stuckDays, state: v.lifecycleState });
  }
  if (stalled.length === 0) return recs;
  // One aggregate recommendation rather than spamming N rows.
  const severity = Math.min(SEVERITY_HIGH, SEVERITY_LOW + stalled.length * 10);
  recs.push({
    type: 'venture_pause',
    severity,
    title: `Pause or archive ${stalled.length} stalled venture${stalled.length === 1 ? '' : 's'}`,
    rationale: `${stalled.length} venture${stalled.length === 1 ? ' has' : 's have'} been stuck `
      + `> ${STALL_DAYS}d without lifecycle movement. Either pause to free capacity, archive, or `
      + 'force a re-assessment.',
    supportingMetrics: { stalled_count: stalled.length, stall_threshold_days: STALL_DAYS, stalled },
    relatedVentureIds: stalled.map((s) => s.id),
  });
  return recs;
}

async function findSequencingRec() {
  const edges = await DependencyEdge.findAll({ where: { status: 'proposed' } });
  if (edges.length < 3) return null;
  // Cluster downstream ventures with multiple inbound proposed edges — those
  // should sequence after their dependencies are released.
  const inboundCount = new Map();
  for (const e of edges) {
    inboundCount.set(e.blockedVentureId, (inboundCount.get(e.blockedVentureId) || 0) + 1);
  }
  const heavy = [...inboundCount.entries()].filter(([, n]) => n >= 2);
  if (heavy.length === 0) return null;
  return {
    type: 'sequencing',
    severity: SEVERITY_MED,
    title: `Sequence ${heavy.length} venture${heavy.length === 1 ? '' : 's'} with multiple inbound dependencies`,
    rationale: `${heavy.length} downstream venture${heavy.length === 1 ? ' has' : 's have'} `
      + 'multiple inbound dependency edges still proposed. Sequencing them after their upstreams '
      + 'release reduces rework risk.',
    supportingMetrics: { heavy_downstream_count: heavy.length, proposed_edge_count: edges.length },
    relatedVentureIds: heavy.map(([id]) => id),
  };
}

async function findEcosystemDiversificationRec(ventures) {
  // Read the latest ecosystem snapshot.
  const latestPerEcosystem = await EcosystemMetric.findAll({ order: [['captured_at', 'DESC']] });
  if (latestPerEcosystem.length === 0) return null;
  const totalActive = ventures.filter(
    (v) => v.lifecycleState !== 'archived' && v.lifecycleState !== 'monitoring',
  ).length;
  if (totalActive < 4) return null;
  const seen = new Map();
  for (const r of latestPerEcosystem) {
    if (!seen.has(r.ecosystem)) seen.set(r.ecosystem, r);
  }
  let top = null;
  for (const row of seen.values()) {
    const count = Number(row.ventureCount || 0);
    if (!top || count > top.count) top = { ecosystem: row.ecosystem, count };
  }
  if (!top || top.count === 0) return null;
  const fraction = top.count / totalActive;
  if (fraction < 0.5) return null;
  return {
    type: 'ecosystem_diversification',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_LOW + Math.round(fraction * 60)),
    title: `Ecosystem concentration: ${top.ecosystem} = ${Math.round(fraction * 100)}% of active`,
    rationale: `${top.count} of ${totalActive} active ventures sit in "${top.ecosystem}". `
      + 'Concentration risk — consider diversifying the next wave into adjacent ecosystems.',
    supportingMetrics: {
      top_ecosystem: top.ecosystem,
      top_ecosystem_count: top.count,
      total_active: totalActive,
      concentration_fraction: Number(fraction.toFixed(3)),
    },
    relatedVentureIds: [],
  };
}

async function computeInterventions() {
  const ventures = await VentureIdea.findAll();
  const readinessRows = await ExecutionReadiness.findAll();
  const snapshot = await ResourceCapacitySnapshot.findOne({ order: [['created_at', 'DESC']] });
  const snapshotJson = snapshot ? snapshot.toJSON() : null;

  const recs = [];
  recs.push(...findHireRecs(snapshotJson));
  const q = findQueueRec(snapshotJson);
  if (q) recs.push(q);
  const r = await findRedistributionRec(snapshotJson, readinessRows, ventures);
  if (r) recs.push(r);
  recs.push(...await findVenturePauseRecs(ventures));
  const s = await findSequencingRec();
  if (s) recs.push(s);
  const e = await findEcosystemDiversificationRec(ventures);
  if (e) recs.push(e);
  return recs;
}

async function refreshInterventions() {
  const recs = await computeInterventions();
  const persisted = [];
  for (const rec of recs) {
    // Skip duplicates of an open recommendation of the same type + title.
    // eslint-disable-next-line no-await-in-loop
    const existing = await InterventionRecommendation.findOne({
      where: { interventionType: rec.type, title: rec.title, status: 'pending' },
    });
    if (existing) {
      // Refresh supporting metrics on the existing row so the latest numbers
      // are reflected, but keep the row identity (and pending status) stable.
      // eslint-disable-next-line no-await-in-loop
      await existing.update({
        severity: rec.severity, rationale: rec.rationale,
        supportingMetrics: rec.supportingMetrics, relatedVentureIds: rec.relatedVentureIds,
      });
      persisted.push(existing.toJSON());
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const row = await InterventionRecommendation.create({
      interventionType: rec.type,
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
  const rows = await InterventionRecommendation.findAll({
    where: { status: 'pending' }, order: [['severity', 'DESC'], ['created_at', 'DESC']],
  });
  return rows.map((r) => r.toJSON());
}

async function listAll({ limit = 200 } = {}) {
  const rows = await InterventionRecommendation.findAll({
    order: [['created_at', 'DESC']], limit,
  });
  return rows.map((r) => r.toJSON());
}

async function updateStatus(id, status, actor = null) {
  if (!['acknowledged', 'dismissed'].includes(status)) {
    const err = new Error(`Invalid status ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await InterventionRecommendation.findByPk(id);
  if (!row) { const err = new Error(`Intervention ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.update({ status, acknowledgedBy: actor, acknowledgedAt: new Date() });
  return row.toJSON();
}

module.exports = {
  SEVERITY_HIGH, SEVERITY_MED, SEVERITY_LOW, STALL_DAYS,
  findHireRecs, findQueueRec, findRedistributionRec, findVenturePauseRecs,
  findSequencingRec, findEcosystemDiversificationRec,
  computeInterventions, refreshInterventions,
  listPending, listAll, updateStatus,
};
