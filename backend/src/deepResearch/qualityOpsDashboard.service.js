// Deep Research Phase 14 — AI Quality Operations Center aggregator.
//
// Read-only composite over the Phase 14 quality surfaces + the Phase 13
// lineage/provenance health + the Phase 12 RBAC coverage.

const { Op } = require('sequelize');
const {
  ProposalQuality, GroundednessAnalysis, StrategicCoherence,
  EvaluatorAlignment, QualityMetric, QualityAlert,
  OpportunityOutput,
} = require('../models');

const proposalQuality = require('./proposalQuality.service');
const groundedness = require('./groundedness.service');
const strategicCoherence = require('./strategicCoherence.service');
const evaluatorAlignment = require('./evaluatorAlignment.service');
const lineageEdgeWriter = require('./lineageEdgeWriter.service');
const rbacCoverage = require('./rbacCoverage.service');
const proposalExplainability = require('./proposalExplainability.service');

async function snapshotMetrics({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const [pqs, grs, scs, eas] = await Promise.all([
    ProposalQuality.findAll({ where, limit: 1000 }),
    GroundednessAnalysis.findAll({ where, limit: 1000 }),
    StrategicCoherence.findAll({ where, limit: 1000 }),
    EvaluatorAlignment.findAll({ where, limit: 1000 }),
  ]);
  const avg = (rows, key) => (rows.length === 0 ? 0
    : Math.round(rows.reduce((a, r) => a + (r[key] || 0), 0) / rows.length));
  const totalOutputs = await OpportunityOutput.count(
    organizationId != null ? { where: { organizationId: Number(organizationId) } } : undefined,
  );
  const row = await QualityMetric.create({
    organizationId: organizationId == null ? null : Number(organizationId),
    avgQualityScore: avg(pqs, 'compositeScore'),
    avgGroundednessScore: avg(grs, 'groundednessScore'),
    avgCoherenceScore: avg(scs, 'coherenceScore'),
    avgAlignmentScore: avg(eas, 'alignmentScore'),
    outputsScored: pqs.length,
    outputsTotal: totalOutputs,
    coveragePct: totalOutputs > 0 ? Math.round((pqs.length / totalOutputs) * 10000) / 100 : 0,
  });
  return row.toJSON();
}

async function recentMetricSnapshots({ organizationId = null, limit = 30 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await QualityMetric.findAll({
    where, order: [['captured_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 30),
  });
  return rows.map((r) => r.toJSON());
}

async function listAlerts({ organizationId = null, status = 'open', limit = 100 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  if (status) where.status = status;
  const rows = await QualityAlert.findAll({
    where, order: [['severity', 'DESC'], ['detected_at', 'DESC']],
    limit: Math.min(500, Number(limit) || 100),
  });
  return rows.map((r) => r.toJSON());
}

async function getDashboard({ organizationId = null } = {}) {
  const [pq, gr, sc, ea, lineage, rbac, explain] = await Promise.all([
    proposalQuality.summarize({ organizationId }),
    groundedness.summarize({ organizationId }),
    strategicCoherence.summarize({ organizationId }),
    evaluatorAlignment.summarize({ organizationId }),
    lineageEdgeWriter.summarize({ organizationId }),
    rbacCoverage.latestSnapshot(),
    proposalExplainability.summarize({ organizationId }),
  ]);
  const alerts = await listAlerts({ organizationId, status: 'open', limit: 25 });

  // Composite quality score: weighted average of the 4 quality dimensions
  // + lineage/RBAC/explainability operational signals.
  const composite = Math.round(
    (pq.avg_composite || 0) * 0.35
    + (gr.avg_groundedness || 0) * 0.20
    + (sc.avg_coherence || 0) * 0.15
    + (ea.avg_alignment || 0) * 0.15
    + (explain.coverage_pct || 0) * 0.10
    + (rbac && rbac.coveragePct ? Number(rbac.coveragePct) : 0) * 0.05,
  );
  const status = composite >= 85 ? 'healthy'
    : composite >= 60 ? 'watch'
    : composite >= 40 ? 'elevated' : 'critical';

  return {
    generated_at: new Date().toISOString(),
    organization_id: organizationId,
    composite_quality_score: composite, status,
    proposal_quality: pq,
    groundedness: gr,
    strategic_coherence: sc,
    evaluator_alignment: ea,
    lineage_health: lineage,
    rbac_coverage: rbac,
    explainability: explain,
    open_alerts: alerts,
  };
}

module.exports = {
  snapshotMetrics, recentMetricSnapshots, listAlerts, getDashboard,
};
