// Deep Research Phase 13 — read-only synthesized replay event.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('ReplayEvent', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    replayScope: { type: DataTypes.STRING(64), allowNull: false, field: 'replay_scope' },
    scopeId: { type: DataTypes.STRING(128), allowNull: false, field: 'scope_id' },
    ordinal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    eventKind: { type: DataTypes.STRING(64), allowNull: false, field: 'event_kind' },
    eventAt: { type: DataTypes.DATE, allowNull: false, field: 'event_at' },
    actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
    sourceTable: { type: DataTypes.STRING(64), allowNull: false, field: 'source_table' },
    sourceId: { type: DataTypes.STRING(128), allowNull: true, field: 'source_id' },
    summary: { type: DataTypes.STRING(512), allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'replay_events', timestamps: true, underscored: true, updatedAt: false });
};
