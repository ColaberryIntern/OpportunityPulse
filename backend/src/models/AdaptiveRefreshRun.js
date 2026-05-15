// Deep Research Phase 6 — one row per scheduled refresh execution.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const AdaptiveRefreshRun = sequelize.define('AdaptiveRefreshRun', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    runType: { type: DataTypes.STRING(40), allowNull: false, field: 'run_type' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'running' },
    durationMs: { type: DataTypes.INTEGER, allowNull: true, field: 'duration_ms' },
    stepCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'step_count' },
    errorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'error_count' },
    trigger: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'cron' },
    results: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    errors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  }, {
    tableName: 'adaptive_refresh_runs', timestamps: false, underscored: true,
    indexes: [{ fields: ['started_at'] }, { fields: ['status'] }],
  });
  return AdaptiveRefreshRun;
};
