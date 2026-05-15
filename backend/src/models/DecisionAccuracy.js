// Deep Research Phase 5 — decision quality snapshot per decision type.
// MEASURED only. Never used to modify scoring.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const DecisionAccuracy = sequelize.define('DecisionAccuracy', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    decisionType: { type: DataTypes.STRING(40), allowNull: false, field: 'decision_type' },
    periodDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 90, field: 'period_days' },
    totalCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_count' },
    progressedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'progressed_count' },
    stalledCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'stalled_count' },
    reversedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'reversed_count' },
    accuracy: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'decision_accuracy', timestamps: false, underscored: true,
    indexes: [{ fields: ['decision_type', 'computed_at'] }],
  });
  return DecisionAccuracy;
};
