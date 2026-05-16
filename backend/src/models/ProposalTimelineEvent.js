// Deep Research Phase 9 — proposal timeline event log per pursuit.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ProposalTimelineEvent = sequelize.define('ProposalTimelineEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: false, field: 'pursuit_id' },
    eventKind: { type: DataTypes.STRING(30), allowNull: false, field: 'event_kind' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    label: { type: DataTypes.STRING(300), allowNull: false },
    detail: { type: DataTypes.TEXT, allowNull: true },
    dueAt: { type: DataTypes.DATE, allowNull: true, field: 'due_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    severity: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'normal' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'proposal_timeline_events', timestamps: true, underscored: true,
    indexes: [{ fields: ['pursuit_id'] }, { fields: ['status'] }, { fields: ['due_at'] }],
  });
  return ProposalTimelineEvent;
};
