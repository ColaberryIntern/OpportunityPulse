// Deep Research Phase 10 — durable background worker job.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const WorkerJob = sequelize.define('WorkerJob', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    jobKind: { type: DataTypes.STRING(40), allowNull: false, field: 'job_kind' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued' },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: true, field: 'opportunity_id' },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    result: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    attempt: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3, field: 'max_attempts' },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
    runAfter: { type: DataTypes.DATE, allowNull: true, field: 'run_after' },
    acquiredAt: { type: DataTypes.DATE, allowNull: true, field: 'acquired_at' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    progressPct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'progress_pct' },
    batchId: { type: DataTypes.STRING(60), allowNull: true, field: 'batch_id' },
    actor: { type: DataTypes.STRING(120), allowNull: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
  }, {
    tableName: 'worker_jobs', timestamps: true, underscored: true,
    indexes: [
      { fields: ['status', 'priority'] },
      { fields: ['pursuit_id'] },
      { fields: ['batch_id'] },
      { fields: ['job_kind', 'status'] },
    ],
  });
  return WorkerJob;
};
