// Deep Research Phase 5 — strategic-drift alerts. RECOMMENDATIONS only —
// never auto-applied. status: pending → acknowledged | dismissed.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const DriftAlert = sequelize.define('DriftAlert', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    driftType: { type: DataTypes.STRING(40), allowNull: false, field: 'drift_type' },
    severity: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    description: { type: DataTypes.TEXT, allowNull: true },
    relatedVentureIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'related_venture_ids' },
    relatedEcosystems: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'related_ecosystems' },
    recommendation: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    acknowledgedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'acknowledged_by' },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true, field: 'acknowledged_at' },
  }, {
    tableName: 'drift_alerts', timestamps: true, underscored: true,
    indexes: [{ fields: ['status'] }, { fields: ['drift_type', 'created_at'] }],
  });
  return DriftAlert;
};
