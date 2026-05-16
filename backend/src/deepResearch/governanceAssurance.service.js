// Deep Research Phase 13 — Enterprise Governance Assurance Center aggregator.
//
// Read-only composite over every Phase 13 surface — feeds the
// /admin/deep-research/governance-assurance page.

const crossProvenance = require('./crossProvenance.service');
const operationalLineage = require('./operationalLineage.service');
const permissionIntegrity = require('./permissionIntegrity.service');
const governanceConsistency = require('./governanceConsistency.service');
const proposalExplainability = require('./proposalExplainability.service');
const governanceDrift = require('./governanceDrift.service');
const approvalProvenance = require('./approvalProvenance.service');
const operationalReplay = require('./operationalReplay.service');
const streamIntegrity = require('./streamIntegrity.service');
const rbacCoverage = require('./rbacCoverage.service');

async function getDashboard({ organizationId = null } = {}) {
  const [
    provenance, lineage, permission, consistency, explain,
    drift, approvals, replay, stream, rbac,
  ] = await Promise.all([
    crossProvenance.summarize({ organizationId }),
    operationalLineage.summarize({ organizationId }),
    permissionIntegrity.computeIntegrity({ organizationId }).catch(() => null),
    governanceConsistency.summarize({ organizationId }),
    proposalExplainability.summarize({ organizationId }),
    governanceDrift.summarize({ organizationId }),
    approvalProvenance.summarize({ organizationId }),
    operationalReplay.summarize({ organizationId }),
    streamIntegrity.summarize({ organizationId }),
    rbacCoverage.latestSnapshot(),
  ]);

  const explainCoverage = explain && explain.coverage_pct != null ? explain.coverage_pct : 0;
  const consistencyScore = consistency && consistency.consistency_score != null
    ? consistency.consistency_score : 100;
  const permissionScore = permission && permission.integrity_score != null
    ? permission.integrity_score : 100;
  const streamScore = stream && stream.integrity_score != null ? stream.integrity_score : 100;
  const driftScore = Math.max(0, 100 - Math.min(100, (drift.open || 0) * 5 + (drift.critical || 0) * 10));

  const assurance_score = Math.round(
    (explainCoverage * 0.2)
    + (consistencyScore * 0.25)
    + (permissionScore * 0.2)
    + (streamScore * 0.15)
    + (driftScore * 0.2),
  );
  const status = assurance_score >= 85 ? 'healthy'
    : assurance_score >= 60 ? 'watch'
    : assurance_score >= 40 ? 'elevated' : 'critical';

  return {
    generated_at: new Date().toISOString(),
    organization_id: organizationId,
    assurance_score, status,
    sub_scores: {
      explainability_coverage: explainCoverage,
      consistency: consistencyScore,
      permission_integrity: permissionScore,
      stream_integrity: streamScore,
      drift_pressure: driftScore,
    },
    provenance,
    lineage,
    permission,
    consistency,
    explainability: explain,
    drift,
    approvals,
    replay,
    stream,
    rbac,
  };
}

module.exports = {
  getDashboard,
};
