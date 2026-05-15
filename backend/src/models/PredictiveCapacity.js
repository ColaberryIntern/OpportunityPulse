// Deep Research Phase 5 — capacity forecast row (30/90/180 day horizons).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const PredictiveCapacity = sequelize.define('PredictiveCapacity', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    horizonDays: { type: DataTypes.INTEGER, allowNull: false, field: 'horizon_days' },
    scenario: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'realistic' },
    projectedStaffingPressure: {
      type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'projected_staffing_pressure',
    },
    projectedQueuePressure: {
      type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'projected_queue_pressure',
    },
    projectedConcurrencyDemand: {
      type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'projected_concurrency_demand',
    },
    bottleneckRisks: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'bottleneck_risks' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'predictive_capacity', timestamps: false, underscored: true,
    indexes: [{ fields: ['horizon_days', 'computed_at'] }],
  });
  return PredictiveCapacity;
};
