// Deep Research Phase 6 — per-step audit log within a refresh run.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const RefreshHistory = sequelize.define('RefreshHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    runId: { type: DataTypes.INTEGER, allowNull: false, field: 'run_id' },
    stepName: { type: DataTypes.STRING(60), allowNull: false, field: 'step_name' },
    status: { type: DataTypes.STRING(20), allowNull: false },
    durationMs: { type: DataTypes.INTEGER, allowNull: true, field: 'duration_ms' },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'refresh_history', timestamps: true, updatedAt: false, underscored: true,
    indexes: [{ fields: ['run_id'] }],
  });
  return RefreshHistory;
};
