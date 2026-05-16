// Deep Research Phase 9 — Capture Operations Dashboard aggregator.
//
// Read-only composite over all Phase 9 surfaces — feeds the
// /admin/deep-research/capture-ops page. Bounded queries, no recomputation
// (every section reads the latest persisted state).

const { Op } = require('sequelize');
const {
  PursuitWorkspace, ProposalReadinessScore,
  ComplianceMatrix, ComplianceGap, RfpAttachment, ProposalArtifact,
  SubmissionPackage, ProposalTimelineEvent, ParallelDraftJob,
} = require('../models');

const ACTIVE_PURSUIT_STATUSES = ['open', 'in_progress'];

async function listActivePursuits({ limit = 20 } = {}) {
  const rows = await PursuitWorkspace.findAll({
    where: { status: { [Op.in]: ACTIVE_PURSUIT_STATUSES } },
    order: [['updated_at', 'DESC']],
    limit: Math.min(50, Number(limit) || 20),
  });
  return rows.map((r) => r.toJSON());
}

// Roll readiness scores up across all active pursuits.
async function readinessSummary(pursuitIds) {
  if (pursuitIds.length === 0) {
    return { count: 0, mean_composite: 0, by_classification: {} };
  }
  // For each pursuit, take the most-recent readiness score.
  const rows = await ProposalReadinessScore.findAll({
    where: { scopeKind: 'pursuit', scopeId: { [Op.in]: pursuitIds } },
    order: [['computed_at', 'DESC']],
  });
  const latest = new Map();
  for (const r of rows) {
    if (!latest.has(r.scopeId)) latest.set(r.scopeId, r);
  }
  const buckets = { ready: 0, needs_prep: 0, blocked: 0, unknown: 0 };
  let total = 0;
  for (const r of latest.values()) {
    total += Number(r.compositeScore || 0);
    buckets[r.classification] = (buckets[r.classification] || 0) + 1;
  }
  return {
    count: latest.size,
    mean_composite: latest.size > 0 ? Number((total / latest.size).toFixed(1)) : 0,
    by_classification: buckets,
  };
}

async function complianceGapsByPursuit(pursuitIds) {
  if (pursuitIds.length === 0) return [];
  const rows = await ComplianceGap.findAll({
    where: { pursuitId: { [Op.in]: pursuitIds }, status: 'open' },
    order: [['severity', 'DESC']],
    limit: 60,
  });
  // Bucket per pursuit.
  const byPursuit = new Map();
  for (const r of rows) {
    if (!byPursuit.has(r.pursuitId)) byPursuit.set(r.pursuitId, []);
    byPursuit.get(r.pursuitId).push(r.toJSON());
  }
  return Array.from(byPursuit.entries()).map(([pursuitId, gaps]) => ({
    pursuit_id: pursuitId,
    gap_count: gaps.length,
    top_severity: gaps.reduce((m, g) => Math.max(m, Number(g.severity || 0)), 0),
    sample: gaps.slice(0, 5),
  })).sort((a, b) => b.top_severity - a.top_severity);
}

async function artifactHealth() {
  const [active, expiring, expired] = await Promise.all([
    ProposalArtifact.count({ where: { status: 'active' } }),
    ProposalArtifact.count({ where: { status: 'expiring' } }),
    ProposalArtifact.count({ where: { status: 'expired' } }),
  ]);
  const total = active + expiring + expired;
  return {
    total, active, expiring, expired,
    health_pct: total > 0 ? Math.round(((active + expiring * 0.5) / total) * 100) : 0,
  };
}

async function packageSnapshot(pursuitIds) {
  if (pursuitIds.length === 0) return { count: 0, by_status: {}, mean_completeness: 0 };
  const rows = await SubmissionPackage.findAll({
    where: { pursuitId: { [Op.in]: pursuitIds } },
    order: [['assembled_at', 'DESC']],
    limit: 100,
  });
  const byStatus = {};
  let total = 0; let scoreSum = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    scoreSum += Number(r.completenessScore || 0); total += 1;
  }
  return {
    count: total, by_status: byStatus,
    mean_completeness: total > 0 ? Number((scoreSum / total).toFixed(1)) : 0,
  };
}

async function timelineRollup(pursuitIds) {
  if (pursuitIds.length === 0) return { overdue: 0, blocked: 0, due_next: null };
  const now = new Date();
  const events = await ProposalTimelineEvent.findAll({
    where: {
      pursuitId: { [Op.in]: pursuitIds },
      status: { [Op.in]: ['pending', 'in_progress', 'overdue', 'blocked'] },
    },
    order: [['due_at', 'ASC NULLS LAST']],
    limit: 200,
  });
  let overdue = 0; let blocked = 0; let dueNext = null;
  for (const e of events) {
    if (e.status === 'blocked') blocked += 1;
    if (e.dueAt && new Date(e.dueAt) < now && e.status !== 'done') overdue += 1;
    if (!dueNext && e.dueAt && new Date(e.dueAt) >= now && e.status !== 'done') {
      dueNext = { pursuit_id: e.pursuitId, label: e.label, due_at: e.dueAt };
    }
  }
  return { overdue, blocked, due_next: dueNext };
}

async function draftQueueRollup() {
  const rows = await ParallelDraftJob.findAll({
    where: { status: { [Op.in]: ['queued', 'running'] } },
    order: [['created_at', 'DESC']],
    limit: 50,
  });
  return {
    in_flight: rows.length,
    sample: rows.slice(0, 10).map((r) => r.toJSON()),
  };
}

async function getCaptureOps() {
  const activePursuits = await listActivePursuits({ limit: 20 });
  const pursuitIds = activePursuits.map((p) => p.id);
  const [readiness, gaps, artifacts, packages, timeline, draftQueue] = await Promise.all([
    readinessSummary(pursuitIds),
    complianceGapsByPursuit(pursuitIds),
    artifactHealth(),
    packageSnapshot(pursuitIds),
    timelineRollup(pursuitIds),
    draftQueueRollup(),
  ]);
  return {
    generated_at: new Date().toISOString(),
    active_pursuits: activePursuits,
    readiness_summary: readiness,
    compliance_gaps_by_pursuit: gaps,
    artifact_health: artifacts,
    package_snapshot: packages,
    timeline: timeline,
    draft_queue: draftQueue,
  };
}

module.exports = {
  ACTIVE_PURSUIT_STATUSES,
  listActivePursuits, readinessSummary, complianceGapsByPursuit,
  artifactHealth, packageSnapshot, timelineRollup, draftQueueRollup,
  getCaptureOps,
};
