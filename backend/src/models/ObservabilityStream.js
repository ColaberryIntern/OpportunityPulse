// Deep Research Phase 11 — active SSE/WebSocket stream registry.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ObservabilityStream = sequelize.define('ObservabilityStream', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    streamToken: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'stream_token' },
    userId: { type: DataTypes.INTEGER, allowNull: true, field: 'user_id' },
    userEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'user_email' },
    channels: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    connectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'connected_at' },
    lastEventAt: { type: DataTypes.DATE, allowNull: true, field: 'last_event_at' },
    eventsSent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'events_sent' },
    disconnectedAt: { type: DataTypes.DATE, allowNull: true, field: 'disconnected_at' },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true, field: 'ip_address' },
  }, {
    tableName: 'observability_streams', timestamps: true, underscored: true,
  });
  return ObservabilityStream;
};
