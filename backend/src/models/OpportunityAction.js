module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const OpportunityAction = sequelize.define('OpportunityAction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'opportunity_id',
      references: { model: 'opportunities', key: 'id' },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    actionType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'action_type',
      validate: {
        isIn: [['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH']],
      },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'planned',
      validate: {
        isIn: [['planned', 'in_progress', 'executed', 'abandoned']],
      },
    },
    revenueGenerated: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: 'revenue_generated',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'opportunity_actions',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['opportunity_id', 'user_id'] },
      { fields: ['user_id', 'status'] },
    ],
  });

  OpportunityAction.associate = (models) => {
    OpportunityAction.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    OpportunityAction.belongsTo(models.Opportunity, { foreignKey: 'opportunity_id', as: 'opportunity' });
  };

  return OpportunityAction;
};
