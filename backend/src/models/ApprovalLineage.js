// Deep Research Phase 13 — approval chain history (append-only).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('ApprovalLineage', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    workflowAssignmentId: { type: DataTypes.INTEGER, allowNull: true, field: 'workflow_assignment_id' },
    subjectKind: { type: DataTypes.STRING(64), allowNull: false, field: 'subject_kind' },
    subjectId: { type: DataTypes.STRING(128), allowNull: false, field: 'subject_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    action: { type: DataTypes.STRING(32), allowNull: false },
    actorUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'actor_user_id' },
    actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
    fromState: { type: DataTypes.STRING(32), allowNull: true, field: 'from_state' },
    toState: { type: DataTypes.STRING(32), allowNull: true, field: 'to_state' },
    durationSeconds: { type: DataTypes.INTEGER, allowNull: true, field: 'duration_seconds' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    overrideReason: { type: DataTypes.TEXT, allowNull: true, field: 'override_reason' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'approval_lineage', timestamps: true, underscored: true, updatedAt: false });
};
