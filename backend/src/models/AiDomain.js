module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const AiDomain = sequelize.define('AiDomain', {
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
    naicsCodes: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      field: 'naics_codes',
    },
  }, {
    tableName: 'ai_domains',
    timestamps: true,
    underscored: true,
  });

  AiDomain.associate = (models) => {
    AiDomain.hasMany(models.OpportunityClassification, { foreignKey: 'domain_id', as: 'classifications' });
    AiDomain.hasMany(models.StrategicCluster, { foreignKey: 'domain_id', as: 'clusters' });
  };

  return AiDomain;
};
