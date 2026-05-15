// Deep Research Phase 8 — audit row for every pursuit → Review Queue handoff.
// One row per (pursuit_id, opportunity_id, output_type) attempt — captures
// success/failure so the bridge is auditable without re-running.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ReviewQueueHandoff = sequelize.define('ReviewQueueHandoff', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: false, field: 'pursuit_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_id' },
    outputId: { type: DataTypes.INTEGER, allowNull: true, field: 'output_id' },
    outputType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposal', field: 'output_type' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    actor: { type: DataTypes.STRING(120), allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  }, {
    tableName: 'review_queue_handoffs', timestamps: true, updatedAt: false, underscored: true,
    indexes: [{ fields: ['pursuit_id'] }, { fields: ['status'] }],
  });
  return ReviewQueueHandoff;
};
