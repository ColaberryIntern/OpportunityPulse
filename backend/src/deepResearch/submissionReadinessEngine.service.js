// Deep Research Phase 9 — composite submission readiness engine.
//
// Wraps Phase 8's per-dimension proposalReadiness scoring with the Phase 9
// artifact / attachment / compliance / package / gap signals and emits
// ONE explainable composite. Persisted in proposal_readiness_scores via
// the Phase 8 model (scope_kind='pursuit'). Deterministic + auditable.
//
// MEASURE-ONLY. Never modifies pursuit state. Never auto-submits.

const { Op } = require('sequelize');
const {
  PursuitWorkspace,
  ProposalReadinessScore,
} = require('../models');
const rfpAttachment = require('./rfpAttachment.service');
const complianceMatrix = require('./complianceMatrix.service');
const submissionPackage = require('./submissionPackage.service');
const complianceGap = require('./complianceGap.service');
const proposalTimeline = require('./proposalTimeline.service');
const proposalReadiness = require('./proposalReadiness.service'); // Phase 8

// Weights (sum to 100):
//   compliance_matrix   25
//   attachment_locker   15
//   artifact_vault      15
//   package_readiness   15
//   staffing            10  (re-uses Phase 8 staffing dimension)
//   capability          10  (re-uses Phase 8 capability dimension)
//   timeline_health     10  (overdue penalty)
const WEIGHTS = {
  compliance_matrix: 25,
  attachment_locker: 15,
  artifact_vault: 15,
  package_readiness: 15,
  staffing: 10,
  capability: 10,
  timeline_health: 10,
};

const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));

async function scoreComplianceMatrix(pursuitId) {
  const out = await complianceMatrix.getMatrixForPursuit(pursuitId);
  if (!out || !out.matrix) return { score: 0, total: 0, satisfied: 0 };
  const m = out.matrix;
  return {
    score: clamp(m.completionPct),
    total: m.totalCount, satisfied: m.satisfiedCount, partial: m.partialCount, missing: m.missingCount,
  };
}

async function scoreAttachmentLocker(pursuitId) {
  const summary = await rfpAttachment.summarizeForPursuit(pursuitId);
  if (summary.total === 0) return { score: 0, ...summary };
  // 50 base for having any attachments; +25 for an RFP, +15 for amendments,
  // +10 for >= 3 supporting docs. Penalize expired by 10.
  let s = 50;
  if (summary.has_rfp) s += 25;
  if (summary.has_amendments) s += 15;
  if (summary.total >= 3) s += 10;
  s -= Math.min(20, summary.expired * 5);
  return { score: clamp(s), ...summary };
}

async function scoreArtifactVault(pursuitId, pursuit) {
  // Pursuits don't directly own artifacts in v1 — we score based on
  // org-wide vault health: do we have at least one active capability_statement
  // and one active past_performance available?
  const { ProposalArtifact } = require('../models');
  const [cap, perf, expiring] = await Promise.all([
    ProposalArtifact.count({ where: { artifactKind: 'capability_statement', status: { [Op.in]: ['active', 'expiring'] } } }),
    ProposalArtifact.count({ where: { artifactKind: 'past_performance', status: { [Op.in]: ['active', 'expiring'] } } }),
    ProposalArtifact.count({ where: { status: 'expiring' } }),
  ]);
  let s = 0;
  if (cap >= 1) s += 40;
  if (perf >= 1) s += 40;
  if (cap + perf >= 4) s += 10;
  s -= Math.min(20, expiring * 3);
  return { score: clamp(s), capability_count: cap, past_performance_count: perf, expiring };
}

async function scorePackageReadiness(pursuitId) {
  const pkgs = await submissionPackage.listForPursuit(pursuitId);
  if (pkgs.length === 0) return { score: 0, packages: 0 };
  const best = pkgs.reduce(
    (acc, p) => (Number(p.completenessScore || 0) > acc ? Number(p.completenessScore || 0) : acc),
    0,
  );
  return { score: clamp(best), packages: pkgs.length, best_completeness: best };
}

async function scoreTimelineHealth(pursuitId) {
  const summary = await proposalTimeline.summarizeForPursuit(pursuitId);
  if (summary.total === 0) return { score: 50, ...summary };
  // 100 baseline. Subtract 8 per overdue event (cap 60). Subtract 15 per blocker.
  let s = 100 - Math.min(60, summary.overdue * 8) - Math.min(30, summary.blocked * 15);
  return { score: clamp(s), ...summary };
}

function classify(composite, blockerCount) {
  if (blockerCount >= 3) return 'blocked';
  if (composite >= 80) return 'ready';
  if (composite >= 55) return 'needs_prep';
  if (composite < 35) return 'blocked';
  return 'needs_prep';
}

async function scorePursuit(pursuitId, { actor = null } = {}) {
  const pursuit = await PursuitWorkspace.findByPk(pursuitId);
  if (!pursuit) {
    const err = new Error(`Pursuit ${pursuitId} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  // Pull Phase 8 readiness for the staffing + capability dimensions so we
  // don't duplicate that math. If none exists, score it on-the-fly.
  let phase8 = await proposalReadiness.getLatestForPursuit(pursuitId);
  if (!phase8) {
    try { phase8 = await proposalReadiness.scorePursuit(pursuitId); } catch (_) { phase8 = null; }
  }

  const [matrix, attachments, artifacts, packageReadiness, timeline, gaps] = await Promise.all([
    scoreComplianceMatrix(pursuitId),
    scoreAttachmentLocker(pursuitId),
    scoreArtifactVault(pursuitId, pursuit),
    scorePackageReadiness(pursuitId),
    scoreTimelineHealth(pursuitId),
    complianceGap.listForPursuit(pursuitId, { status: 'open' }),
  ]);

  const staffing = phase8 ? clamp(Number(phase8.staffingReadiness)) : 50;
  const capability = phase8 ? clamp(Number(phase8.capabilityReadiness)) : 50;

  const composite = clamp(
    (matrix.score * WEIGHTS.compliance_matrix
      + attachments.score * WEIGHTS.attachment_locker
      + artifacts.score * WEIGHTS.artifact_vault
      + packageReadiness.score * WEIGHTS.package_readiness
      + staffing * WEIGHTS.staffing
      + capability * WEIGHTS.capability
      + timeline.score * WEIGHTS.timeline_health) / 100,
  );

  // Blockers: critical-severity gaps + overdue critical timeline events.
  const blockers = [];
  for (const g of gaps) {
    if (Number(g.severity) >= 75) blockers.push(`${g.gapKind}: ${g.label}`);
  }
  if (timeline.overdue >= 1 && timeline.overdue !== undefined) {
    blockers.push(`${timeline.overdue} overdue timeline event${timeline.overdue === 1 ? '' : 's'}`);
  }
  if (matrix.score < 40 && matrix.total > 0) {
    blockers.push(`Compliance matrix completion ${matrix.score}%`);
  }

  const accelerators = [];
  if (packageReadiness.best_completeness >= 80) {
    accelerators.push(`Submission package ${packageReadiness.best_completeness}% complete`);
  }
  if (attachments.has_rfp && attachments.total >= 3) {
    accelerators.push(`${attachments.total} RFP attachments organized in the locker`);
  }
  if (artifacts.capability_count >= 2 && artifacts.past_performance_count >= 2) {
    accelerators.push('Strong artifact vault — multiple reusable capabilities + past performance');
  }

  const classification = classify(composite, blockers.length);
  const submissionRisk = clamp(100 - composite + blockers.length * 5);
  const expectedEffortHours = Math.round(
    Math.max(8, (100 - composite) * 0.75)
      + (timeline.overdue || 0) * 4,
  );

  const rationale = `Composite ${composite.toFixed(1)}/100 across 7 dimensions. `
    + `Compliance ${matrix.score}, attachments ${attachments.score}, artifacts ${artifacts.score}, `
    + `package ${packageReadiness.score}, staffing ${staffing}, capability ${capability}, `
    + `timeline ${timeline.score}. ${blockers.length} blocker${blockers.length === 1 ? '' : 's'}, `
    + `${accelerators.length} accelerator${accelerators.length === 1 ? '' : 's'}.`;

  // Persist into the Phase 8 ProposalReadinessScore table (scope=pursuit).
  const row = await ProposalReadinessScore.create({
    scopeKind: 'pursuit', scopeId: pursuit.id,
    compositeScore: composite, classification,
    staffingReadiness: staffing,
    capabilityReadiness: capability,
    complianceReadiness: matrix.score,
    assetReadiness: artifacts.score,
    dependencyReadiness: phase8 ? Number(phase8.dependencyReadiness) : 70,
    accelerationPct: packageReadiness.score,
    submissionRisk,
    expectedEffortHours,
    blockers, accelerators, rationale,
  });
  return {
    ...row.toJSON(),
    factors: {
      compliance_matrix: matrix,
      attachment_locker: attachments,
      artifact_vault: artifacts,
      package_readiness: packageReadiness,
      timeline_health: timeline,
      staffing: { score: staffing },
      capability: { score: capability },
    },
    submission_confidence: Math.round(composite - blockers.length * 5),
  };
}

async function getLatest(pursuitId) {
  return proposalReadiness.getLatestForPursuit(pursuitId);
}

module.exports = {
  WEIGHTS, clamp, classify,
  scoreComplianceMatrix, scoreAttachmentLocker, scoreArtifactVault,
  scorePackageReadiness, scoreTimelineHealth,
  scorePursuit, getLatest,
};
