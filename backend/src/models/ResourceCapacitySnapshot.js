// Deep Research Phase 4 — time-series organizational capacity snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ResourceCapacitySnapshot = sequelize.define('ResourceCapacitySnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    staffingPressure: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'staffing_pressure' },
    infraPressure: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'infra_pressure' },
    concurrencyLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'concurrency_limit' },
    activeVentures: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'active_ventures' },
    buildNowVentures: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'build_now_ventures' },
    roleDemand: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'role_demand' },
    bottlenecks: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    rationale: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'resource_capacity_snapshots',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [{ fields: ['created_at'] }],
  });
  return ResourceCapacitySnapshot;
};
