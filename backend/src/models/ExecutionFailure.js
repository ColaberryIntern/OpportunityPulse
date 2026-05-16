// Deep Research Phase 10 — typed execution failure log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ExecutionFailure = sequelize.define('ExecutionFailure', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    workerJobId: { type: DataTypes.INTEGER, allowNull: true, field: 'worker_job_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    failureKind: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'transient', field: 'failure_kind' },
    jobKind: { type: DataTypes.STRING(40), allowNull: false, field: 'job_kind' },
    errorMessage: { type: DataTypes.TEXT, allowNull: false, field: 'error_message' },
    errorClass: { type: DataTypes.STRING(120), allowNull: true, field: 'error_class' },
    attempt: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    willRetry: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'will_retry' },
    nextRetryAt: { type: DataTypes.DATE, allowNull: true, field: 'next_retry_at' },
    stackSnippet: { type: DataTypes.TEXT, allowNull: true, field: 'stack_snippet' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    detectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'detected_at' },
  }, {
    tableName: 'execution_failures', timestamps: false, underscored: true,
    indexes: [{ fields: ['worker_job_id'] }, { fields: ['failure_kind'] }],
  });
  return ExecutionFailure;
};
