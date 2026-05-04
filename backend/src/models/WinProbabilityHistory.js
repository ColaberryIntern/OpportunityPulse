module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // Append-only snapshot of every win-probability calculation. Lets us
  // audit how the learning engine's output shifts as outcomes accrue.
  const WinProbabilityHistory = sequelize.define('WinProbabilityHistory', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER, allowNull: true, field: 'organization_id',
    },
    opportunityId: {
      type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_id',
    },
    winProbability: {
      type: DataTypes.DECIMAL(4, 3), allowNull: false, field: 'win_probability',
    },
    components: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'win_probability_history',
    timestamps: true,
    updatedAt: false,
    underscored: true,
  });

  return WinProbabilityHistory;
};
