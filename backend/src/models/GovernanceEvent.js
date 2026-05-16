// Deep Research Phase 11 — operator-action governance event log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const GovernanceEvent = sequelize.define('GovernanceEvent', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    eventKind: { type: DataTypes.STRING(64), allowNull: false, field: 'event_kind' },
    severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 40 },
    subjectKind: { type: DataTypes.STRING(64), allowNull: true, field: 'subject_kind' },
    subjectId: { type: DataTypes.STRING(128), allowNull: true, field: 'subject_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
    summary: { type: DataTypes.STRING(512), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'governance_events', timestamps: true, underscored: true, updatedAt: false,
  });
  return GovernanceEvent;
};
