// Deep Research Phase 11 — operator workflow log over Phase 10 sla_events.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const SlaAcknowledgement = sequelize.define('SlaAcknowledgement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    slaEventId: { type: DataTypes.INTEGER, allowNull: false, field: 'sla_event_id' },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    actorUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'actor_user_id' },
    actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
    action: { type: DataTypes.STRING(32), allowNull: false },
    severityAtAction: { type: DataTypes.INTEGER, allowNull: true, field: 'severity_at_action' },
    assigneeUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'assignee_user_id' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'sla_acknowledgements', timestamps: true, underscored: true, updatedAt: false,
  });
  return SlaAcknowledgement;
};
