module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const Bundle = sequelize.define('Bundle', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    theme: { type: DataTypes.STRING(300), allowNull: false },
    key: { type: DataTypes.STRING(100), allowNull: false },
    opportunityIds: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'opportunity_ids',
    },
    opportunityCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'opportunity_count',
    },
    estimatedTotalValue: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      field: 'estimated_total_value',
    },
    summary: { type: DataTypes.TEXT, allowNull: true },
    generatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'generated_at' },
    // v3: monetization layer — what to build to monetize this cluster.
    suggestedSolution: {
      type: DataTypes.STRING(300),
      allowNull: true,
      field: 'suggested_solution',
    },
    estimatedBuildTimeDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'estimated_build_time_days',
    },
    strategy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    strategyHash: { type: DataTypes.STRING(64), allowNull: true, field: 'strategy_hash' },
  }, {
    tableName: 'bundles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['key'] },
      { fields: ['estimated_total_value'] },
    ],
  });

  return Bundle;
};
