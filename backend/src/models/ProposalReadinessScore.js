// Deep Research Phase 8 — proposal readiness scoring snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ProposalReadinessScore = sequelize.define('ProposalReadinessScore', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    scopeKind: { type: DataTypes.STRING(20), allowNull: false, field: 'scope_kind' },
    scopeId: { type: DataTypes.INTEGER, allowNull: false, field: 'scope_id' },
    compositeScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'composite_score' },
    classification: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unknown' },
    staffingReadiness: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'staffing_readiness' },
    capabilityReadiness: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'capability_readiness' },
    complianceReadiness: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'compliance_readiness' },
    assetReadiness: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'asset_readiness' },
    dependencyReadiness: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'dependency_readiness' },
    accelerationPct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'acceleration_pct' },
    submissionRisk: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'submission_risk' },
    expectedEffortHours: { type: DataTypes.DECIMAL(6, 2), allowNull: true, field: 'expected_effort_hours' },
    blockers: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    accelerators: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'proposal_readiness_scores', timestamps: false, underscored: true,
    indexes: [{ fields: ['scope_kind', 'scope_id'] }],
  });
  return ProposalReadinessScore;
};
