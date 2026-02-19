module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const OpportunityMultiTag = sequelize.define('OpportunityMultiTag', {
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
    dimension: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    dimensionValueId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'dimension_value_id',
    },
    confidence: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
  }, {
    tableName: 'opportunity_multi_tags',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  });

  OpportunityMultiTag.associate = (models) => {
    OpportunityMultiTag.belongsTo(models.Opportunity, { foreignKey: 'opportunity_id', as: 'opportunity' });
  };

  return OpportunityMultiTag;
};
