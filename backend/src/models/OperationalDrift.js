// Deep Research Phase 6 — operational drift alerts (distinct from Phase 5
// strategic drift_alerts: this is queue/execution/staffing imbalance).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const OperationalDrift = sequelize.define('OperationalDrift', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    driftType: { type: DataTypes.STRING(40), allowNull: false, field: 'drift_type' },
    severity: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    description: { type: DataTypes.TEXT, allowNull: true },
    mitigation: { type: DataTypes.TEXT, allowNull: true },
    supportingMetrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'supporting_metrics' },
    relatedVentureIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'related_venture_ids' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    acknowledgedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'acknowledged_by' },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true, field: 'acknowledged_at' },
  }, {
    tableName: 'operational_drift', timestamps: true, underscored: true,
    indexes: [{ fields: ['status'] }, { fields: ['drift_type', 'created_at'] }],
  });
  return OperationalDrift;
};
