// Deep Research Phase 13 — governance consistency check finding.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('GovernanceConsistency', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    checkKind: { type: DataTypes.STRING(64), allowNull: false, field: 'check_kind' },
    severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    subjectKind: { type: DataTypes.STRING(64), allowNull: true, field: 'subject_kind' },
    subjectId: { type: DataTypes.STRING(128), allowNull: true, field: 'subject_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    summary: { type: DataTypes.STRING(512), allowNull: true },
    recommendation: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
    detectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'detected_at' },
    resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'governance_consistency', timestamps: true, underscored: true });
};
