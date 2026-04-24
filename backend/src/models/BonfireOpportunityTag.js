module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const BonfireOpportunityTag = sequelize.define('BonfireOpportunityTag', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    opportunityId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'opportunity_id',
      references: { model: 'bonfire_opportunities', key: 'id' },
      onDelete: 'CASCADE',
    },
    tag: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  }, {
    tableName: 'bonfire_opportunity_tags',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['opportunity_id', 'tag'] },
    ],
  });

  BonfireOpportunityTag.associate = (models) => {
    BonfireOpportunityTag.belongsTo(models.BonfireOpportunity, {
      foreignKey: 'opportunity_id',
      as: 'opportunity',
    });
  };

  return BonfireOpportunityTag;
};
