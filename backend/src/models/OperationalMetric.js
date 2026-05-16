// Deep Research Phase 10 — per-pursuit operational health composite snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const OperationalMetric = sequelize.define('OperationalMetric', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    throughputScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'throughput_score' },
    slaPressure: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'sla_pressure' },
    agingScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'aging_score' },
    workerHealth: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 100, field: 'worker_health' },
    artifactHealth: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'artifact_health' },
    openSlaEvents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'open_sla_events' },
    queuePressure: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'queue_pressure' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    capturedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'captured_at' },
  }, {
    tableName: 'operational_metrics', timestamps: false, underscored: true,
    indexes: [{ fields: ['pursuit_id', 'captured_at'] }],
  });
  return OperationalMetric;
};
