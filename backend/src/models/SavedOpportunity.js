module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const SavedOpportunity = sequelize.define('SavedOpportunity', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'opportunity_id',
      references: { model: 'opportunities', key: 'id' },
    },
  }, {
    tableName: 'saved_opportunities',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id', 'opportunity_id'] },
    ],
  });

  SavedOpportunity.associate = (models) => {
    SavedOpportunity.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    SavedOpportunity.belongsTo(models.Opportunity, { foreignKey: 'opportunity_id', as: 'opportunity' });
  };

  return SavedOpportunity;
};
