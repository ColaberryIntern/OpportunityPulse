// Deep Research Phase 6 — predicted-vs-actual forecast comparison.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ForecastAccuracy = sequelize.define('ForecastAccuracy', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    forecastKind: { type: DataTypes.STRING(40), allowNull: false, field: 'forecast_kind' },
    scope: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'portfolio' },
    scopeId: { type: DataTypes.INTEGER, allowNull: true, field: 'scope_id' },
    predictedValue: { type: DataTypes.DECIMAL(12, 3), allowNull: true, field: 'predicted_value' },
    actualValue: { type: DataTypes.DECIMAL(12, 3), allowNull: true, field: 'actual_value' },
    deltaAbsolute: { type: DataTypes.DECIMAL(12, 3), allowNull: true, field: 'delta_absolute' },
    deltaFraction: { type: DataTypes.DECIMAL(6, 3), allowNull: true, field: 'delta_fraction' },
    classification: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unknown' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'forecast_accuracy', timestamps: false, underscored: true,
    indexes: [{ fields: ['forecast_kind', 'computed_at'] }],
  });
  return ForecastAccuracy;
};
