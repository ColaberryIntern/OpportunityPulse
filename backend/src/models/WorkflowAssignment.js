// Deep Research Phase 11 — operator workflow ownership + approval chain.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const WorkflowAssignment = sequelize.define('WorkflowAssignment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    workflowKind: { type: DataTypes.STRING(64), allowNull: false, field: 'workflow_kind' },
    subjectKind: { type: DataTypes.STRING(64), allowNull: false, field: 'subject_kind' },
    subjectId: { type: DataTypes.STRING(128), allowNull: false, field: 'subject_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    assigneeUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'assignee_user_id' },
    assigneeEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'assignee_email' },
    assigneeRole: { type: DataTypes.STRING(64), allowNull: true, field: 'assignee_role' },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    dueAt: { type: DataTypes.DATE, allowNull: true, field: 'due_at' },
    assignedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'assigned_at' },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true, field: 'acknowledged_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    assignedBy: { type: DataTypes.STRING(255), allowNull: true, field: 'assigned_by' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  }, {
    tableName: 'workflow_assignments', timestamps: true, underscored: true,
  });
  return WorkflowAssignment;
};
