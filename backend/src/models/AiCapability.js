module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const AiCapability = sequelize.define('AiCapability', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    slug: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    keywords: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'parent_id',
      references: { model: 'ai_capabilities', key: 'id' },
    },
  }, {
    tableName: 'ai_capabilities',
    timestamps: true,
    underscored: true,
  });

  AiCapability.associate = (models) => {
    AiCapability.belongsTo(models.AiCapability, { foreignKey: 'parent_id', as: 'parent' });
    AiCapability.hasMany(models.AiCapability, { foreignKey: 'parent_id', as: 'children' });
    AiCapability.hasMany(models.OpportunityClassification, { foreignKey: 'capability_id', as: 'classifications' });
    AiCapability.hasMany(models.StrategicCluster, { foreignKey: 'capability_id', as: 'clusters' });
  };

  return AiCapability;
};
