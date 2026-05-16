// Deep Research Phase 14 — actionable quality alert.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('QualityAlert', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    alertKind: { type: DataTypes.STRING(64), allowNull: false, field: 'alert_kind' },
    severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    opportunityOutputId: { type: DataTypes.INTEGER, allowNull: true, field: 'opportunity_output_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    summary: { type: DataTypes.STRING(512), allowNull: true },
    recommendation: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
    detectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'detected_at' },
    resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'quality_alerts', timestamps: true, underscored: true });
};
