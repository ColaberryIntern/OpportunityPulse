// Deep Research Phase 13 — governance drift event log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('GovernanceDrift', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    driftKind: { type: DataTypes.STRING(64), allowNull: false, field: 'drift_kind' },
    severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    impact: { type: DataTypes.STRING(255), allowNull: true },
    remediation: { type: DataTypes.TEXT, allowNull: true },
    subjectKind: { type: DataTypes.STRING(64), allowNull: true, field: 'subject_kind' },
    subjectId: { type: DataTypes.STRING(128), allowNull: true, field: 'subject_id' },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
    detectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'detected_at' },
    resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'governance_drift', timestamps: true, underscored: true });
};
