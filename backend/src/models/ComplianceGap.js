// Deep Research Phase 9 — compliance gap detection rows.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ComplianceGap = sequelize.define('ComplianceGap', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: true, field: 'opportunity_id' },
    gapKind: { type: DataTypes.STRING(40), allowNull: false, field: 'gap_kind' },
    label: { type: DataTypes.STRING(300), allowNull: false },
    severity: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 50 },
    readinessImpact: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'readiness_impact' },
    recommendedActions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'recommended_actions' },
    relatedArtifactIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'related_artifact_ids' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    detectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'detected_at' },
    resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
  }, {
    tableName: 'compliance_gaps', timestamps: false, underscored: true,
    indexes: [{ fields: ['pursuit_id'] }, { fields: ['gap_kind', 'status'] }],
  });
  return ComplianceGap;
};
