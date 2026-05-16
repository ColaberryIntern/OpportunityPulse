// Deep Research Phase 14 — pre-computed replay timeline visualization payload.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('ReplayVisualization', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    replayScope: { type: DataTypes.STRING(64), allowNull: false, field: 'replay_scope' },
    scopeId: { type: DataTypes.STRING(128), allowNull: false, field: 'scope_id' },
    eventCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'event_count' },
    durationMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'duration_ms' },
    timeline: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    actors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    generatedBy: { type: DataTypes.STRING(255), allowNull: true, field: 'generated_by' },
  }, { tableName: 'replay_visualizations', timestamps: true, underscored: true, updatedAt: false });
};
