// Deep Research Phase 6 — portfolio-level strategic recommendations.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const StrategicRecommendation = sequelize.define('StrategicRecommendation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    recommendationType: { type: DataTypes.STRING(40), allowNull: false, field: 'recommendation_type' },
    severity: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    title: { type: DataTypes.STRING(200), allowNull: false },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    supportingMetrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'supporting_metrics' },
    relatedVentureIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'related_venture_ids' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    acknowledgedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'acknowledged_by' },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: true, field: 'acknowledged_at' },
  }, {
    tableName: 'strategic_recommendations', timestamps: true, underscored: true,
    indexes: [{ fields: ['status'] }],
  });
  return StrategicRecommendation;
};
