// Deep Research Phase 4 — confidence-decay recommendations.
// CRUCIALLY: these are recommendations only. No autonomous transitions.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ReassessmentEvent = sequelize.define('ReassessmentEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    recommendationType: { type: DataTypes.STRING(40), allowNull: false, field: 'recommendation_type' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    severity: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    reason: { type: DataTypes.TEXT, allowNull: true },
    factors: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    acknowledgedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'acknowledged_by' },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true, field: 'acknowledged_at' },
  }, {
    tableName: 'reassessment_events',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }, { fields: ['status'] }],
  });
  return ReassessmentEvent;
};
