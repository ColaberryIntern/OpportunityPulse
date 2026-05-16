// Deep Research Phase 10 — append-only SLA breach detection log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const SlaEvent = sequelize.define('SlaEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    slaKind: { type: DataTypes.STRING(40), allowNull: false, field: 'sla_kind' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    subjectKind: { type: DataTypes.STRING(40), allowNull: true, field: 'subject_kind' },
    subjectId: { type: DataTypes.STRING(120), allowNull: true, field: 'subject_id' },
    severity: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 50 },
    ageDays: { type: DataTypes.INTEGER, allowNull: true, field: 'age_days' },
    thresholdDays: { type: DataTypes.INTEGER, allowNull: true, field: 'threshold_days' },
    escalation: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    detectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'detected_at' },
    resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
  }, {
    tableName: 'sla_events', timestamps: false, underscored: true,
    indexes: [{ fields: ['sla_kind', 'status'] }, { fields: ['pursuit_id'] }],
  });
  return SlaEvent;
};
