// Deep Research Phase 13 — SSE reliability + integrity snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('StreamIntegrity', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    windowMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5, field: 'window_minutes' },
    heartbeatsEmitted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'heartbeats_emitted' },
    eventsPublished: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'events_published' },
    eventsDropped: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'events_dropped' },
    duplicateSuppressed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'duplicate_suppressed' },
    reconnectCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'reconnect_count' },
    maxConcurrent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'max_concurrent' },
    backpressurePct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'backpressure_pct' },
    capturedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'captured_at' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'stream_integrity', timestamps: true, underscored: true, updatedAt: false });
};
