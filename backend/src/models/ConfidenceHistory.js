// Deep Research Phase 4 — time series of computed confidence per venture.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ConfidenceHistory = sequelize.define('ConfidenceHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    confidence: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0 },
    factors: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'confidence_history',
    timestamps: false,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }, { fields: ['computed_at'] }],
  });
  return ConfidenceHistory;
};
