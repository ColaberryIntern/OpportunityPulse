// Deep Research Phase 5 — generic key/value time series for any metric the
// temporal engines want to track over time.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const TemporalSnapshot = sequelize.define('TemporalSnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    metricKey: { type: DataTypes.STRING(60), allowNull: false, field: 'metric_key' },
    metricValue: { type: DataTypes.DECIMAL(10, 3), allowNull: true, field: 'metric_value' },
    scope: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'portfolio' },
    scopeId: { type: DataTypes.INTEGER, allowNull: true, field: 'scope_id' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    snapshotAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'snapshot_at' },
  }, {
    tableName: 'temporal_snapshots', timestamps: false, underscored: true,
    indexes: [{ fields: ['metric_key', 'snapshot_at'] }, { fields: ['scope', 'scope_id'] }],
  });
  return TemporalSnapshot;
};
