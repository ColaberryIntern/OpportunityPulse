// Deep Research Phase 6 — operational drift monitor.
//
// Different from Phase 5 strategic drift_alerts: this watches OPERATIONAL
// state — queue accumulation, transition slowdown, role imbalance,
// dependency backlog, execution bottlenecks. MEASURE-ONLY: emits typed
// drift rows for a human, never auto-pauses anything.
//
// Drift types:
//   queue_drift              — ExecutionQueueItem count rising over 14d
//   execution_slowdown       — transitions/7d dropped vs baseline
//   staffing_imbalance       — one role's deficit dominates
//   dependency_accumulation  — pending dependency edges rising
//   execution_bottleneck     — one lifecycle stage with > median+2*MAD wait

const {
  ExecutionQueueItem, VentureLifecycleEvent, DependencyEdge,
  ResourceCapacitySnapshot, OperationalDrift,
} = require('../models');

const DAY_MS = 86400000;
const SEVERITY_HIGH = 80;
const SEVERITY_MED = 55;
const SEVERITY_LOW = 30;

async function detectQueueDrift() {
  const now = Date.now();
  const all = await ExecutionQueueItem.findAll();
  if (all.length === 0) return null;
  // Compare items added in last 7d vs items added 8-14d ago.
  const recent = all.filter((q) => now - new Date(q.createdAt).getTime() <= 7 * DAY_MS).length;
  const prior = all.filter((q) => {
    const age = now - new Date(q.createdAt).getTime();
    return age > 7 * DAY_MS && age <= 14 * DAY_MS;
  }).length;
  if (recent <= prior || (recent - prior) < 3) return null;
  const delta = recent - prior;
  return {
    drift_type: 'queue_drift',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_MED + delta * 5),
    description: `Queue growing: ${recent} items added in last 7d vs ${prior} in the prior 7d.`,
    mitigation: 'Increase concurrency, defer non-critical BUILD_NOWs, or review the queueing rules.',
    supporting_metrics: { recent_7d: recent, prior_7d: prior, delta },
    related_venture_ids: [],
  };
}

async function detectExecutionSlowdown() {
  const events = await VentureLifecycleEvent.findAll({ order: [['created_at', 'DESC']] });
  if (events.length === 0) return null;
  const now = Date.now();
  const last7 = events.filter((e) => now - new Date(e.createdAt).getTime() <= 7 * DAY_MS).length;
  const last30 = events.filter((e) => now - new Date(e.createdAt).getTime() <= 30 * DAY_MS).length;
  const expected = (last30 / 30) * 7;
  if (expected < 1) return null;
  const ratio = last7 / expected;
  if (ratio >= 0.6) return null;
  return {
    drift_type: 'execution_slowdown',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_MED + Math.round((1 - ratio) * 40)),
    description: `Transitions in last 7d (${last7}) are ${Math.round(ratio * 100)}% of the 30d baseline (${expected.toFixed(1)}).`,
    mitigation: 'Identify which lifecycle stage stalled. Check approvals, staffing, deployment readiness.',
    supporting_metrics: { last7, last30, expected_7d: Number(expected.toFixed(2)), ratio: Number(ratio.toFixed(3)) },
    related_venture_ids: [],
  };
}

async function detectStaffingImbalance() {
  const snapshot = await ResourceCapacitySnapshot.findOne({ order: [['created_at', 'DESC']] });
  if (!snapshot) return null;
  const roleDemand = snapshot.roleDemand || {};
  let worst = null;
  for (const [role, info] of Object.entries(roleDemand)) {
    if (info.deficit > 0 && (!worst || info.deficit > worst.deficit)) {
      worst = { role, ...info };
    }
  }
  if (!worst || worst.deficit < 2) return null;
  return {
    drift_type: 'staffing_imbalance',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_LOW + worst.deficit * 15),
    description: `Role "${worst.role}" has demand ${worst.demand} vs supply ${worst.supply} — deficit ${worst.deficit}.`,
    mitigation: 'Either hire for this role, retrain an adjacent role, or sequence ventures so the deficit is split across waves.',
    supporting_metrics: worst,
    related_venture_ids: [],
  };
}

async function detectDependencyAccumulation() {
  const edges = await DependencyEdge.findAll();
  const proposed = edges.filter((e) => e.status === 'proposed');
  if (proposed.length < 5) return null;
  return {
    drift_type: 'dependency_accumulation',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_LOW + proposed.length * 5),
    description: `${proposed.length} dependency edge${proposed.length === 1 ? '' : 's'} proposed and unreviewed. Backlog growing.`,
    mitigation: 'Run a dependency-review session to approve, reject, or annotate the open edges.',
    supporting_metrics: {
      proposed_count: proposed.length,
      total_edge_count: edges.length,
    },
    related_venture_ids: [...new Set(proposed.flatMap((e) => [e.blockerVentureId, e.blockedVentureId]))],
  };
}

async function detectExecutionBottleneck() {
  // Median time spent in each lifecycle state. Flag any state whose median
  // exceeds 2x global median.
  const events = await VentureLifecycleEvent.findAll({ order: [['created_at', 'ASC']] });
  if (events.length < 6) return null;
  const byVenture = new Map();
  for (const e of events) {
    if (!byVenture.has(e.ventureIdeaId)) byVenture.set(e.ventureIdeaId, []);
    byVenture.get(e.ventureIdeaId).push(e);
  }
  const durations = {}; // state → [days]
  for (const list of byVenture.values()) {
    for (let i = 1; i < list.length; i += 1) {
      const days = (new Date(list[i].createdAt) - new Date(list[i - 1].createdAt)) / DAY_MS;
      const state = list[i - 1].toState;
      if (!durations[state]) durations[state] = [];
      durations[state].push(days);
    }
  }
  const medians = {};
  for (const [state, list] of Object.entries(durations)) {
    list.sort((a, b) => a - b);
    medians[state] = Number(list[Math.floor(list.length / 2)].toFixed(2));
  }
  const allMedians = Object.values(medians).filter((m) => m > 0);
  if (allMedians.length === 0) return null;
  const sorted = allMedians.slice().sort((a, b) => a - b);
  const globalMedian = sorted[Math.floor(sorted.length / 2)];
  if (globalMedian === 0) return null;
  const offenders = Object.entries(medians).filter(([, m]) => m > globalMedian * 2);
  if (offenders.length === 0) return null;
  const worst = offenders.sort(([, a], [, b]) => b - a)[0];
  return {
    drift_type: 'execution_bottleneck',
    severity: Math.min(SEVERITY_HIGH, SEVERITY_LOW + Math.round((worst[1] / globalMedian) * 10)),
    description: `Stage "${worst[0]}" median wait ${worst[1]}d vs global median ${globalMedian}d.`,
    mitigation: `Investigate the "${worst[0]}" stage: missing decision, staffing shortage, or scope drift.`,
    supporting_metrics: { stage_medians: medians, global_median: globalMedian, worst_stage: worst[0] },
    related_venture_ids: [],
  };
}

async function computeDrift() {
  const recs = [];
  for (const fn of [
    detectQueueDrift, detectExecutionSlowdown, detectStaffingImbalance,
    detectDependencyAccumulation, detectExecutionBottleneck,
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const r = await fn();
    if (r) recs.push(r);
  }
  return recs;
}

async function refreshDrift() {
  const recs = await computeDrift();
  const persisted = [];
  for (const r of recs) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await OperationalDrift.findOne({
      where: { driftType: r.drift_type, status: 'pending' },
    });
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
      await existing.update({
        severity: r.severity, description: r.description, mitigation: r.mitigation,
        supportingMetrics: r.supporting_metrics, relatedVentureIds: r.related_venture_ids,
      });
      persisted.push(existing.toJSON());
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const row = await OperationalDrift.create({
      driftType: r.drift_type, severity: r.severity,
      description: r.description, mitigation: r.mitigation,
      supportingMetrics: r.supporting_metrics, relatedVentureIds: r.related_venture_ids,
      status: 'pending',
    });
    persisted.push(row.toJSON());
  }
  return { generated: recs.length, persisted: persisted.length, drift: persisted };
}

async function listPending() {
  const rows = await OperationalDrift.findAll({
    where: { status: 'pending' }, order: [['severity', 'DESC'], ['created_at', 'DESC']],
  });
  return rows.map((r) => r.toJSON());
}

async function listAll({ limit = 200 } = {}) {
  const rows = await OperationalDrift.findAll({
    order: [['created_at', 'DESC']], limit,
  });
  return rows.map((r) => r.toJSON());
}

async function updateStatus(id, status, actor = null) {
  if (!['acknowledged', 'dismissed'].includes(status)) {
    const err = new Error(`Invalid status ${status}`); err.code = 'BAD_INPUT'; throw err;
  }
  const row = await OperationalDrift.findByPk(id);
  if (!row) { const err = new Error(`Drift ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  await row.update({ status, acknowledgedBy: actor, acknowledgedAt: new Date() });
  return row.toJSON();
}

module.exports = {
  SEVERITY_HIGH, SEVERITY_MED, SEVERITY_LOW,
  detectQueueDrift, detectExecutionSlowdown, detectStaffingImbalance,
  detectDependencyAccumulation, detectExecutionBottleneck,
  computeDrift, refreshDrift,
  listPending, listAll, updateStatus,
};
