// Deep Research Phase 15 — saved replay-timeline filter set.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('ReplayTimelineView', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    replayScope: { type: DataTypes.STRING(64), allowNull: false, field: 'replay_scope' },
    scopeId: { type: DataTypes.STRING(128), allowNull: false, field: 'scope_id' },
    filters: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    eventCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'event_count' },
    spanSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'span_seconds' },
    generatedBy: { type: DataTypes.STRING(255), allowNull: true, field: 'generated_by' },
  }, { tableName: 'replay_timeline_views', timestamps: true, underscored: true, updatedAt: false });
};
