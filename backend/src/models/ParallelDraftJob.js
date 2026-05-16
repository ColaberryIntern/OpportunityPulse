// Deep Research Phase 9 — parallel draft generation queue.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ParallelDraftJob = sequelize.define('ParallelDraftJob', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: false, field: 'pursuit_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_id' },
    outputType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposal', field: 'output_type' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued' },
    outputId: { type: DataTypes.INTEGER, allowNull: true, field: 'output_id' },
    attempt: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
    acquiredAt: { type: DataTypes.DATE, allowNull: true, field: 'acquired_at' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    batchId: { type: DataTypes.STRING(60), allowNull: false, field: 'batch_id' },
    actor: { type: DataTypes.STRING(120), allowNull: true },
  }, {
    tableName: 'parallel_draft_jobs', timestamps: true, updatedAt: false, underscored: true,
    indexes: [{ fields: ['pursuit_id'] }, { fields: ['batch_id'] }, { fields: ['status'] }],
  });
  return ParallelDraftJob;
};
