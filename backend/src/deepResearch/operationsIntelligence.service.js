// Deep Research Phase 15 — Operations Intelligence Center aggregator.
//
// Read-only composite over Phase 14 quality + Phase 13 lineage/replay +
// Phase 12 RBAC + Phase 11 governance health. Computes a single
// overall_score weighted across the 4 pillars, plus the trend direction
// from the latest qualityTrend snapshot.

const {
  OperationalIntelligence,
} = require('../models');

const qualityAutomation = require('./qualityAutomation.service');
const qualityAlert = require('./qualityAlert.service');
const qualityTrend = require('./qualityTrend.service');
const qaWorkflow = require('./qaWorkflow.service');
const proposalQuality = require('./proposalQuality.service');
const groundedness = require('./groundedness.service');
const strategicCoherence = require('./strategicCoherence.service');
const evaluatorAlignment = require('./evaluatorAlignment.service');
const lineageEdgeWriter = require('./lineageEdgeWriter.service');
const governanceAssurance = require('./governanceAssurance.service');

async function compute({ organizationId = null } = {}) {
  const [
    pq, gr, sc, ea,
    alerts, trend, qaSummary,
    lineage, assurance, automation,
  ] = await Promise.all([
    proposalQuality.summarize({ organizationId }),
    groundedness.summarize({ organizationId }),
    strategicCoherence.summarize({ organizationId }),
    evaluatorAlignment.summarize({ organizationId }),
    qualityAlert.summarize({ organizationId }),
    qualityTrend.summarize({ organizationId }),
    qaWorkflow.summarize({ organizationId }),
    lineageEdgeWriter.summarize({ organizationId }),
    governanceAssurance.getDashboard({ organizationId }).catch(() => null),
    qualityAutomation.summarize({ organizationId }),
  ]);

  // Quality pillar — average of the 4 quality dimensions.
  const qualityScore = Math.round(
    ((pq.avg_composite || 0)
      + (gr.avg_groundedness || 0)
      + (sc.avg_coherence || 0)
      + (ea.avg_alignment || 0)) / 4,
  );

  // Lineage integrity pillar.
  const provRecords = lineage && lineage.provenance ? (lineage.provenance.total_records || 0) : 0;
  const edges = lineage && lineage.lineage ? (lineage.lineage.total_edges || 0) : 0;
  let lineageScore = 0;
  if (provRecords >= 100) lineageScore = 100;
  else if (provRecords >= 25) lineageScore = 75;
  else if (provRecords >= 5) lineageScore = 50;
  else if (provRecords > 0) lineageScore = 30;

  // QA workflow pillar.
  const qaScore = qaSummary && qaSummary.workflow_score != null ? qaSummary.workflow_score : 100;

  // Governance pillar — pull from Phase 13 assurance if available.
  const governanceScore = assurance && assurance.assurance_score != null
    ? assurance.assurance_score : 60;

  // Overall composite — weighted average.
  const overall = Math.round(
    (qualityScore * 0.35)
    + (lineageScore * 0.20)
    + (qaScore * 0.20)
    + (governanceScore * 0.25),
  );

  const trendLatest = trend && trend.latest;
  const trendDirection = trendLatest && trendLatest.direction ? trendLatest.direction : 'flat';

  return {
    organization_id: organizationId,
    overall_score: overall,
    status: overall >= 85 ? 'healthy'
      : overall >= 60 ? 'watch'
      : overall >= 40 ? 'elevated' : 'critical',
    sub_scores: {
      quality: qualityScore,
      lineage_integrity: lineageScore,
      qa_workflow: qaScore,
      governance_health: governanceScore,
    },
    trend_direction: trendDirection,
    quality: { proposal: pq, groundedness: gr, coherence: sc, alignment: ea },
    alerts, automation, qa: qaSummary, lineage, trend: trendLatest,
    governance_assurance: assurance ? {
      assurance_score: assurance.assurance_score,
      status: assurance.status,
    } : null,
  };
}

async function snapshot({ organizationId = null } = {}) {
  const data = await compute({ organizationId });
  return OperationalIntelligence.create({
    organizationId: organizationId == null ? null : Number(organizationId),
    overallScore: data.overall_score,
    qualityScore: data.sub_scores.quality,
    lineageIntegrityScore: data.sub_scores.lineage_integrity,
    qaWorkflowScore: data.sub_scores.qa_workflow,
    governanceHealthScore: data.sub_scores.governance_health,
    trendDirection: data.trend_direction,
    computedInputs: {
      proposal_count: data.quality.proposal.count,
      groundedness_count: data.quality.groundedness.count,
      coherence_count: data.quality.coherence.count,
      alignment_count: data.quality.alignment.count,
      open_alerts: data.alerts.open,
    },
  });
}

async function recentSnapshots({ organizationId = null, limit = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await OperationalIntelligence.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 30),
  });
  return rows.map((r) => r.toJSON());
}

async function getDashboard({ organizationId = null } = {}) {
  const data = await compute({ organizationId });
  return {
    generated_at: new Date().toISOString(),
    ...data,
    governance_note: 'Read-only operational composite. Recommendation-only — never auto-modifies proposals or governance state.',
  };
}

module.exports = {
  compute, snapshot, recentSnapshots, getDashboard,
};
