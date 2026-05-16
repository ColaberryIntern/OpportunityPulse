// Deep Research Phase 11 — append-only audit event log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const AuditEvent = sequelize.define('AuditEvent', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    actorUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'actor_user_id' },
    actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
    actorRole: { type: DataTypes.STRING(64), allowNull: true, field: 'actor_role' },
    actionKind: { type: DataTypes.STRING(64), allowNull: false, field: 'action_kind' },
    actionVerb: { type: DataTypes.STRING(64), allowNull: false, field: 'action_verb' },
    subjectKind: { type: DataTypes.STRING(64), allowNull: true, field: 'subject_kind' },
    subjectId: { type: DataTypes.STRING(128), allowNull: true, field: 'subject_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true, field: 'ip_address' },
    userAgent: { type: DataTypes.STRING(512), allowNull: true, field: 'user_agent' },
    correlationId: { type: DataTypes.STRING(64), allowNull: true, field: 'correlation_id' },
  }, {
    tableName: 'audit_events', timestamps: true, underscored: true, updatedAt: false,
  });
  return AuditEvent;
};
