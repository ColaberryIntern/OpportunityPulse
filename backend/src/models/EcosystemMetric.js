// Deep Research Phase 5 — per-ecosystem health/maturity/momentum snapshots.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const EcosystemMetric = sequelize.define('EcosystemMetric', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ecosystemKey: { type: DataTypes.STRING(60), allowNull: false, field: 'ecosystem_key' },
    label: { type: DataTypes.STRING(160), allowNull: true },
    ventureCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'venture_count' },
    healthScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'health_score' },
    maturityScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'maturity_score' },
    momentumScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'momentum_score' },
    classification: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'emerging' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'ecosystem_metrics', timestamps: false, underscored: true,
    indexes: [{ fields: ['ecosystem_key', 'computed_at'] }],
  });
  return EcosystemMetric;
};
