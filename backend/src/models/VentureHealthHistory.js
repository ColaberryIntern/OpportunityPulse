// Deep Research Phase 6 — per-venture health classification snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const VentureHealthHistory = sequelize.define('VentureHealthHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    healthClassification: {
      type: DataTypes.STRING(40), allowNull: false, defaultValue: 'healthy', field: 'health_classification',
    },
    healthScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'health_score' },
    signals: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    suggestedIntervention: { type: DataTypes.TEXT, allowNull: true, field: 'suggested_intervention' },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'venture_health_history', timestamps: false, underscored: true,
    indexes: [{ fields: ['venture_idea_id', 'computed_at'] }],
  });
  return VentureHealthHistory;
};
