// Deep Research Phase 12 — SLA digest email send log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const SlaEmailEvent = sequelize.define('SlaEmailEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    recipientEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'recipient_email' },
    digestKind: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'daily', field: 'digest_kind' },
    severityFilter: { type: DataTypes.STRING(32), allowNull: true, field: 'severity_filter' },
    eventsIncluded: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'events_included' },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'queued' },
    subject: { type: DataTypes.STRING(255), allowNull: true },
    bodyPreview: { type: DataTypes.TEXT, allowNull: true, field: 'body_preview' },
    sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sent_at' },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'sla_email_events', timestamps: true, underscored: true, updatedAt: false });
  return SlaEmailEvent;
};
