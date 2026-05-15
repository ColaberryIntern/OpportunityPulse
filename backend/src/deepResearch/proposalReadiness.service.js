// Deep Research Phase 8 — proposal readiness intelligence.
//
// Deterministic 0-100 composite + per-dimension breakdown + blockers/
// accelerators. MEASURE-ONLY: never gates submission, never reorders
// opportunities. Answers "can we realistically bid this quickly?" so the
// executive can make a call.
//
// Dimensions (weights sum to 100):
//   staffing_readiness   25  — execution_readiness.staffing match against profile
//   capability_readiness 20  — venture composite + alignment with profile services
//   compliance_readiness 15  — submission_readiness_artifacts ready / required
//   asset_readiness      20  — proposal acceleration assets matched for opp
//   dependency_readiness 10  — Phase 5 dependency edges status
//   acceleration_pct     10  — how much of the proposal can be reused vs net-new

const { Op } = require('sequelize');
const {
  PursuitWorkspace, Opportunity, OpportunityOutput,
  ProposalAccelerationAsset, SubmissionReadinessArtifact,
  ExecutionReadiness, VentureIdea, DependencyEdge,
  ProposalReadinessScore,
} = require('../models');
const proposalAcceleration = require('./proposalAcceleration.service');

const WEIGHTS = {
  staffing: 25, capability: 20, compliance: 15,
  asset: 20, dependency: 10, acceleration: 10,
};

const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));

// -- per-dimension scorers -------------------------------------------------

async function scoreAssetReadiness(opportunityIds) {
  if (opportunityIds.length === 0) return { score: 0, samples: 0, total_assets: 0 };
  let totalAssets = 0;
  for (const id of opportunityIds.slice(0, 5)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const suggestions = await proposalAcceleration.suggestForOpportunity(id);
      totalAssets += suggestions.length;
    } catch (_) { /* swallow */ }
  }
  // 0 assets = 0; 4+ matched assets per opp (average) = 100.
  const avg = totalAssets / Math.max(1, Math.min(5, opportunityIds.length));
  const score = clamp(Math.min(100, avg * 25));
  return { score, samples: Math.min(5, opportunityIds.length), total_assets: totalAssets };
}

async function scoreCapabilityReadiness(opportunityIds) {
  if (opportunityIds.length === 0) return { score: 0, samples: 0, mean_ai_score: null };
  const opps = await Opportunity.findAll({
    where: { id: { [Op.in]: opportunityIds } },
    attributes: ['id', 'aiScore'],
  });
  const scored = opps.filter((o) => o.aiScore != null);
  if (scored.length === 0) return { score: 40, samples: 0, mean_ai_score: null };
  const mean = scored.reduce((acc, o) => acc + Number(o.aiScore || 0), 0) / scored.length;
  return { score: clamp(mean), samples: scored.length, mean_ai_score: Number(mean.toFixed(2)) };
}

async function scoreComplianceReadiness({ pursuitId = null, opportunityIds = [] } = {}) {
  const where = { required: true };
  if (pursuitId != null) where.pursuitId = pursuitId;
  if (opportunityIds.length > 0) where.opportunityId = { [Op.in]: opportunityIds };
  const artifacts = await SubmissionReadinessArtifact.findAll({ where });
  if (artifacts.length === 0) {
    // No artifacts tracked yet — default to "neutral" 60 rather than 0 so
    // a fresh pursuit doesn't look blocked before anyone has touched it.
    return { score: 60, required: 0, ready: 0 };
  }
  const ready = artifacts.filter((a) => ['ready', 'reviewed'].includes(a.status)).length;
  const score = clamp((ready / artifacts.length) * 100);
  return { score, required: artifacts.length, ready };
}

async function scoreStaffingReadiness(opportunityIds) {
  if (opportunityIds.length === 0) return { score: 50, ventures: 0 };
  // Best-effort: pull executionReadiness rows linked to ventures linked to
  // any of these opps. In v1, treat overall mean execution_readiness_score
  // across all ventures as a proxy.
  const rows = await ExecutionReadiness.findAll({
    order: [['updated_at', 'DESC']], limit: 50,
  });
  if (rows.length === 0) return { score: 50, ventures: 0 };
  const mean = rows.reduce(
    (acc, r) => acc + Number(r.executionReadinessScore || 0), 0,
  ) / rows.length;
  return { score: clamp(mean), ventures: rows.length };
}

async function scoreDependencyReadiness() {
  const edges = await DependencyEdge.findAll();
  if (edges.length === 0) return { score: 80, total: 0, resolved: 0 };
  const resolved = edges.filter(
    (e) => ['confirmed', 'resolved', 'dismissed'].includes(e.status),
  ).length;
  return { score: clamp((resolved / edges.length) * 100), total: edges.length, resolved };
}

function scoreAccelerationPct({ outputs }) {
  // Use existing OpportunityOutputs as a "what's already drafted" signal.
  if (!outputs || outputs.length === 0) return { score: 10, drafted: 0 };
  const approved = outputs.filter((o) => o.status === 'approved').length;
  const drafted = outputs.filter((o) => o.status === 'draft').length;
  const reusable = approved * 30 + drafted * 12;
  return { score: clamp(reusable), drafted, approved };
}

// -- classification -------------------------------------------------------

function classify(composite, blockers) {
  if (blockers.length >= 3) return 'blocked';
  if (composite >= 75) return 'ready';
  if (composite >= 55) return 'needs_prep';
  if (composite < 40 || blockers.length >= 2) return 'blocked';
  return 'needs_prep';
}

function deriveBlockersAndAccelerators(factors) {
  const blockers = [];
  const accelerators = [];
  if (factors.compliance.score < 40 && factors.compliance.required > 0) {
    blockers.push(`${factors.compliance.required - factors.compliance.ready} required submission artifact${factors.compliance.required - factors.compliance.ready === 1 ? '' : 's'} missing`);
  }
  if (factors.staffing.score < 40) {
    blockers.push(`Staffing readiness ${Math.round(factors.staffing.score)} — execution capacity is thin`);
  }
  if (factors.capability.score < 40) {
    blockers.push(`Capability readiness ${Math.round(factors.capability.score)} — mean AI fit score on linked opps is low`);
  }
  if (factors.dependency.score < 50 && factors.dependency.total > 0) {
    blockers.push(`${factors.dependency.total - factors.dependency.resolved} unresolved dependency edge${factors.dependency.total - factors.dependency.resolved === 1 ? '' : 's'}`);
  }
  if (factors.asset.score >= 70) {
    accelerators.push(`${factors.asset.total_assets} reusable proposal assets matched across linked opps`);
  }
  if (factors.acceleration.approved > 0) {
    accelerators.push(`${factors.acceleration.approved} approved past wins to reuse`);
  }
  if (factors.compliance.score >= 80 && factors.compliance.required > 0) {
    accelerators.push(`Compliance set: ${factors.compliance.ready}/${factors.compliance.required} required artifacts ready`);
  }
  return { blockers, accelerators };
}

function effortHoursFromComposite(composite, oppCount) {
  // Heuristic — 60h per opp baseline, scaled down by composite (higher
  // readiness = less net-new work).
  const baseline = oppCount * 60;
  const reuseFactor = Math.max(0.2, 1 - (composite / 130));
  return Number((baseline * reuseFactor).toFixed(1));
}

// -- public API -----------------------------------------------------------

async function scorePursuit(pursuitId) {
  const pursuit = await PursuitWorkspace.findByPk(pursuitId);
  if (!pursuit) {
    const err = new Error(`Pursuit ${pursuitId} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  const oppIds = Array.isArray(pursuit.linkedOpportunityIds)
    ? pursuit.linkedOpportunityIds : [];

  const outputs = oppIds.length
    ? (await OpportunityOutput.findAll({ where: { opportunityId: { [Op.in]: oppIds } } })).map((r) => r.toJSON())
    : [];

  const [staffing, capability, compliance, asset, dependency] = await Promise.all([
    scoreStaffingReadiness(oppIds),
    scoreCapabilityReadiness(oppIds),
    scoreComplianceReadiness({ pursuitId, opportunityIds: oppIds }),
    scoreAssetReadiness(oppIds),
    scoreDependencyReadiness(),
  ]);
  const acceleration = scoreAccelerationPct({ outputs });

  const composite = clamp(
    (staffing.score * WEIGHTS.staffing
      + capability.score * WEIGHTS.capability
      + compliance.score * WEIGHTS.compliance
      + asset.score * WEIGHTS.asset
      + dependency.score * WEIGHTS.dependency
      + acceleration.score * WEIGHTS.acceleration) / 100,
  );

  const factors = { staffing, capability, compliance, asset, dependency, acceleration };
  const { blockers, accelerators } = deriveBlockersAndAccelerators(factors);
  const classification = classify(composite, blockers);
  const submissionRisk = clamp(100 - composite + (blockers.length * 8));
  const expectedEffortHours = effortHoursFromComposite(composite, oppIds.length);

  const rationale = `Composite ${composite.toFixed(1)}/100 across `
    + `${oppIds.length} linked opportunit${oppIds.length === 1 ? 'y' : 'ies'}. `
    + `Strongest: ${Object.entries(factors).sort((a, b) => b[1].score - a[1].score)[0][0]} `
    + `(${Object.entries(factors).sort((a, b) => b[1].score - a[1].score)[0][1].score.toFixed(0)}). `
    + `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}, `
    + `${accelerators.length} accelerator${accelerators.length === 1 ? '' : 's'}.`;

  const row = await ProposalReadinessScore.create({
    scopeKind: 'pursuit', scopeId: pursuit.id,
    compositeScore: composite, classification,
    staffingReadiness: staffing.score,
    capabilityReadiness: capability.score,
    complianceReadiness: compliance.score,
    assetReadiness: asset.score,
    dependencyReadiness: dependency.score,
    accelerationPct: acceleration.score,
    submissionRisk,
    expectedEffortHours,
    blockers, accelerators, rationale,
  });
  return {
    ...row.toJSON(),
    factors,
  };
}

async function getLatestForPursuit(pursuitId) {
  const row = await ProposalReadinessScore.findOne({
    where: { scopeKind: 'pursuit', scopeId: Number(pursuitId) },
    order: [['computed_at', 'DESC']],
  });
  return row ? row.toJSON() : null;
}

module.exports = {
  WEIGHTS,
  clamp, classify, deriveBlockersAndAccelerators, effortHoursFromComposite,
  scoreAssetReadiness, scoreCapabilityReadiness, scoreComplianceReadiness,
  scoreStaffingReadiness, scoreDependencyReadiness, scoreAccelerationPct,
  scorePursuit, getLatestForPursuit,
};
