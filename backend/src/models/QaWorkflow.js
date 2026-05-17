// Deep Research Phase 15 — QA review workflow / remediation lifecycle.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('QaWorkflow', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    workflowKind: { type: DataTypes.STRING(64), allowNull: false, field: 'workflow_kind' },
    opportunityOutputId: { type: DataTypes.INTEGER, allowNull: true, field: 'opportunity_output_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    qualityAlertId: { type: DataTypes.INTEGER, allowNull: true, field: 'quality_alert_id' },
    assigneeUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'assignee_user_id' },
    assigneeEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'assignee_email' },
    severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
    dueAt: { type: DataTypes.DATE, allowNull: true, field: 'due_at' },
    assignedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'assigned_at' },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true, field: 'acknowledged_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    reviewerNotes: { type: DataTypes.TEXT, allowNull: true, field: 'reviewer_notes' },
    remediationSummary: { type: DataTypes.TEXT, allowNull: true, field: 'remediation_summary' },
    overrideReason: { type: DataTypes.TEXT, allowNull: true, field: 'override_reason' },
    history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'qa_workflows', timestamps: true, underscored: true });
};
