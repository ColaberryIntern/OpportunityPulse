// Deep Research Phase 12 — periodic SSE bus throughput snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const StreamMetric = sequelize.define('StreamMetric', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    channel: { type: DataTypes.STRING(64), allowNull: false },
    windowMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5, field: 'window_minutes' },
    eventsPublished: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'events_published' },
    eventsThrottled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'events_throttled' },
    activeSubscribers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'active_subscribers' },
    capturedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'captured_at' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'stream_metrics', timestamps: true, underscored: true, updatedAt: false });
  return StreamMetric;
};
