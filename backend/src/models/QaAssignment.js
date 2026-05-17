// Deep Research Phase 15 — append-only QA assignment event log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('QaAssignment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    qaWorkflowId: { type: DataTypes.INTEGER, allowNull: false, field: 'qa_workflow_id' },
    action: { type: DataTypes.STRING(32), allowNull: false },
    fromUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'from_user_id' },
    fromEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'from_email' },
    toUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'to_user_id' },
    toEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'to_email' },
    assignedBy: { type: DataTypes.STRING(255), allowNull: true, field: 'assigned_by' },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, { tableName: 'qa_assignments', timestamps: true, underscored: true, updatedAt: false });
};
