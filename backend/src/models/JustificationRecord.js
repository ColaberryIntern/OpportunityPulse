// Deep Research Phase 7 — composed rationale snapshot for any insight.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const JustificationRecord = sequelize.define('JustificationRecord', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    insightKind: { type: DataTypes.STRING(40), allowNull: false, field: 'insight_kind' },
    insightId: { type: DataTypes.INTEGER, allowNull: false, field: 'insight_id' },
    headline: { type: DataTypes.TEXT, allowNull: true },
    narrative: { type: DataTypes.TEXT, allowNull: true },
    factors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    channels: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    supportingOpportunityIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'supporting_opportunity_ids' },
    confidence: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'justification_records', timestamps: false, underscored: true,
    indexes: [{ fields: ['insight_kind', 'insight_id'] }],
  });
  return JustificationRecord;
};
