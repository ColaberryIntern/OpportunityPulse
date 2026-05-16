// Deep Research Phase 12 — Governance Integrity Operations Center aggregator.
//
// Composite "trust score" over Phase 11/12 surfaces:
//   - tenant isolation (% of Phase 10 tables that carry org_id)
//   - RBAC coverage (% of routes on requirePermission vs legacy)
//   - prompt provenance (% of outputs with a provenance row)
//   - observability (SSE stream health + throughput)
//   - audit retention (archive eligibility + completed archives)
//
// Each sub-score is 0..100; the overall integrityScore is a weighted mean.
// Operators see the score + breakdown + recent governance integrity rows.

const { Op } = require('sequelize');
const {
  GovernanceIntegrity, AuditEvent, OpportunityOutput,
  RbacCoverage, PromptProvenance, StorageAsset,
} = require('../models');

const promptProvenance = require('./promptProvenance.service');
const auditRetention = require('./auditRetention.service');
const slaDigest = require('./slaDigest.service');
const sseHotPaths = require('./sseHotPaths.service');
const assetMigration = require('./assetMigration.service');
const rbacCoverage = require('./rbacCoverage.service');
const observabilityStream = require('./observabilityStream.service');

const PHASE_10_TABLES_WITH_ORG_ID = [
  // After Phase 12 migration these all have organization_id; the score
  // reads the column-existence at runtime via a quick describeTable call.
  'worker_jobs', 'proposal_execution_queue', 'artifact_lifecycle_events',
  'sla_events', 'queue_metrics', 'storage_assets',
  'execution_failures', 'operational_metrics',
];

async function tenantIsolationScore(sequelize) {
  // Verify each Phase 10 table has an organization_id column.
  let scoped = 0;
  for (const t of PHASE_10_TABLES_WITH_ORG_ID) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const desc = await sequelize.getQueryInterface().describeTable(t);
      if (desc && desc.organization_id) scoped += 1;
    } catch (e) { /* skip */ }
  }
  const pct = Math.round((scoped / PHASE_10_TABLES_WITH_ORG_ID.length) * 100);
  return { score: pct, scoped, total: PHASE_10_TABLES_WITH_ORG_ID.length };
}

async function rbacScoreFor() {
  const snap = await rbacCoverage.latestSnapshot();
  if (!snap) return { score: 0, snapshot: null };
  return { score: Math.round(Number(snap.coveragePct || snap.coverage_pct || 0)), snapshot: snap };
}

async function provenanceScore({ organizationId = null } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const totalOutputs = await OpportunityOutput.count({ where });
  const withProvenance = await OpportunityOutput.count({
    where: { ...where, promptProvenanceId: { [Op.ne]: null } },
  });
  if (totalOutputs === 0) return { score: 100, total_outputs: 0, with_provenance: 0 };
  const pct = Math.round((withProvenance / totalOutputs) * 100);
  return { score: pct, total_outputs: totalOutputs, with_provenance: withProvenance };
}

async function observabilityScore({ organizationId = null } = {}) {
  const summary = observabilityStream.summarize();
  const utilization = summary.max > 0 ? (summary.active / summary.max) : 0;
  // Healthy = low-to-moderate utilization. Penalize near-cap (>90%).
  let s = 100;
  if (utilization > 0.9) s -= 30;
  else if (utilization > 0.7) s -= 10;
  return { score: Math.max(0, s), active: summary.active, max: summary.max };
}

async function retentionScore({ organizationId = null } = {}) {
  const pressure = await auditRetention.retentionPressure({ organizationId });
  // Higher eligible ratio = lower score (something needs archiving).
  let s = 100 - pressure.eligible_ratio_pct;
  if (pressure.archives_completed === 0 && pressure.archive_eligible > 0) s = Math.min(s, 60);
  return { score: Math.max(0, s), pressure };
}

async function computeIntegrity({ organizationId = null, sequelize } = {}) {
  const [tenant, rbac, prov, obs, ret] = await Promise.all([
    tenantIsolationScore(sequelize),
    rbacScoreFor(),
    provenanceScore({ organizationId }),
    observabilityScore({ organizationId }),
    retentionScore({ organizationId }),
  ]);
  const overall = Math.round(
    (tenant.score * 0.25)
    + (rbac.score * 0.2)
    + (prov.score * 0.2)
    + (obs.score * 0.15)
    + (ret.score * 0.2),
  );
  return {
    organization_id: organizationId,
    integrity_score: overall,
    sub_scores: {
      tenant_isolation: tenant.score,
      rbac: rbac.score,
      provenance: prov.score,
      observability: obs.score,
      retention: ret.score,
    },
    inputs: {
      tenant, rbac_snapshot: rbac.snapshot, provenance: prov,
      observability: obs, retention: ret,
    },
  };
}

async function snapshotIntegrity({ organizationId = null, sequelize } = {}) {
  const composite = await computeIntegrity({ organizationId, sequelize });
  return GovernanceIntegrity.create({
    organizationId: organizationId == null ? null : Number(organizationId),
    integrityScore: composite.integrity_score,
    tenantIsolationScore: composite.sub_scores.tenant_isolation,
    rbacScore: composite.sub_scores.rbac,
    provenanceScore: composite.sub_scores.provenance,
    observabilityScore: composite.sub_scores.observability,
    retentionScore: composite.sub_scores.retention,
    computedInputs: composite.inputs,
  });
}

async function recentIntegrity({ organizationId = null, limit = 25 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await GovernanceIntegrity.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 25),
  });
  return rows.map((r) => r.toJSON());
}

async function getDashboard({ organizationId = null, sequelize } = {}) {
  const [composite, slaEmail, migration, provSummary, retention, sseSummary] = await Promise.all([
    computeIntegrity({ organizationId, sequelize }),
    slaDigest.summarize({ organizationId }),
    assetMigration.summarize({ organizationId }),
    promptProvenance.summarize({ organizationId }),
    auditRetention.summarize({ organizationId }),
    Promise.resolve(sseHotPaths.summarize()),
  ]);
  return {
    generated_at: new Date().toISOString(),
    organization_id: organizationId,
    integrity: composite,
    sla_email: slaEmail,
    migration,
    prompt_provenance: provSummary,
    retention,
    sse_metrics: sseSummary,
  };
}

module.exports = {
  PHASE_10_TABLES_WITH_ORG_ID,
  tenantIsolationScore, rbacScoreFor, provenanceScore,
  observabilityScore, retentionScore,
  computeIntegrity, snapshotIntegrity, recentIntegrity,
  getDashboard,
};
