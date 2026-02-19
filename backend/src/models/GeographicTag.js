module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const GeographicTag = sequelize.define('GeographicTag', {
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
    geoType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'geo_type',
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'parent_id',
      references: { model: 'geographic_tags', key: 'id' },
    },
  }, {
    tableName: 'geographic_tags',
    timestamps: true,
    underscored: true,
  });

  GeographicTag.associate = (models) => {
    GeographicTag.belongsTo(models.GeographicTag, { foreignKey: 'parent_id', as: 'parent' });
    GeographicTag.hasMany(models.GeographicTag, { foreignKey: 'parent_id', as: 'children' });
    GeographicTag.hasMany(models.OpportunityClassification, { foreignKey: 'geographic_tag_id', as: 'classifications' });
  };

  return GeographicTag;
};
