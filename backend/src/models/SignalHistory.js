// Deep Research Phase 5 — historical signal snapshot rows. Generic key/value
// time series for any signal we want to chart over time.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const SignalHistory = sequelize.define('SignalHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    signalKey: { type: DataTypes.STRING(60), allowNull: false, field: 'signal_key' },
    signalValue: { type: DataTypes.DECIMAL(10, 3), allowNull: true, field: 'signal_value' },
    scope: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'portfolio' },
    scopeId: { type: DataTypes.INTEGER, allowNull: true, field: 'scope_id' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'signal_history', timestamps: false, underscored: true,
    indexes: [{ fields: ['signal_key', 'computed_at'] }],
  });
  return SignalHistory;
};
