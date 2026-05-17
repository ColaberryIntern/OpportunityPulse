// Deep Research Phase 15 — append-only quality_alert lifecycle history.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('QualityAlertHistory', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    qualityAlertId: { type: DataTypes.INTEGER, allowNull: false, field: 'quality_alert_id' },
    action: { type: DataTypes.STRING(32), allowNull: false },
    actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
    fromStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'from_status' },
    toStatus: { type: DataTypes.STRING(32), allowNull: true, field: 'to_status' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'quality_alert_history', timestamps: true, underscored: true, updatedAt: false });
};
