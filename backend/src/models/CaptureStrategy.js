// Deep Research Phase 8 — composed capture-strategy snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const CaptureStrategy = sequelize.define('CaptureStrategy', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    scopeKind: { type: DataTypes.STRING(20), allowNull: false, field: 'scope_kind' },
    scopeId: { type: DataTypes.INTEGER, allowNull: true, field: 'scope_id' },
    scopeValue: { type: DataTypes.STRING(200), allowNull: true, field: 'scope_value' },
    evaluatorPriorities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'evaluator_priorities' },
    agencyPainPoints: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'agency_pain_points' },
    differentiators: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    positioningRecommendations: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'positioning_recommendations' },
    incumbentRisks: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'incumbent_risks' },
    partnershipOpportunities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'partnership_opportunities' },
    reusableLanguage: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'reusable_language' },
    recurringThemes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'recurring_themes' },
    narrative: { type: DataTypes.TEXT, allowNull: true },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'capture_strategies', timestamps: false, underscored: true,
    indexes: [{ fields: ['scope_kind', 'scope_id'] }],
  });
  return CaptureStrategy;
};
