module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const FreelanceTrendSnapshot = sequelize.define('FreelanceTrendSnapshot', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    snapshotDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'snapshot_date',
    },
    skill: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    demandCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'demand_count',
    },
    avgBudget: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'avg_budget',
    },
    avgProposals: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      field: 'avg_proposals',
    },
    topPlatforms: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'top_platforms',
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'freelance_trend_snapshots',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
      { unique: true, fields: ['snapshot_date', 'skill'] },
      { fields: ['skill'] },
      { fields: ['snapshot_date'] },
    ],
  });

  return FreelanceTrendSnapshot;
};
