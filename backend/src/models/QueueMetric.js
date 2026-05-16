// Deep Research Phase 10 — periodic queue throughput / health snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const QueueMetric = sequelize.define('QueueMetric', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    queueKind: { type: DataTypes.STRING(40), allowNull: false, field: 'queue_kind' },
    windowMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60, field: 'window_minutes' },
    jobsQueued: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'jobs_queued' },
    jobsProcessing: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'jobs_processing' },
    jobsSucceeded: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'jobs_succeeded' },
    jobsFailed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'jobs_failed' },
    jobsCancelled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'jobs_cancelled' },
    medianLatencyMs: { type: DataTypes.INTEGER, allowNull: true, field: 'median_latency_ms' },
    p95LatencyMs: { type: DataTypes.INTEGER, allowNull: true, field: 'p95_latency_ms' },
    retryRate: { type: DataTypes.DECIMAL(5, 3), allowNull: false, defaultValue: 0, field: 'retry_rate' },
    capturedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'captured_at' },
  }, {
    tableName: 'queue_metrics', timestamps: false, underscored: true,
    indexes: [{ fields: ['queue_kind', 'captured_at'] }],
  });
  return QueueMetric;
};
