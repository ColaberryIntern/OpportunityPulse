// Deep Research Phase 10 — proposal execution queue entry.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ProposalExecutionQueue = sequelize.define('ProposalExecutionQueue', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: false, field: 'pursuit_id' },
    queueKind: { type: DataTypes.STRING(40), allowNull: false, field: 'queue_kind' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued' },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    totalJobs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_jobs' },
    succeededJobs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'succeeded_jobs' },
    failedJobs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'failed_jobs' },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    result: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    slaDueAt: { type: DataTypes.DATE, allowNull: true, field: 'sla_due_at' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    actor: { type: DataTypes.STRING(120), allowNull: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
  }, {
    tableName: 'proposal_execution_queue', timestamps: true, underscored: true,
    indexes: [{ fields: ['pursuit_id'] }, { fields: ['status'] }],
  });
  return ProposalExecutionQueue;
};
