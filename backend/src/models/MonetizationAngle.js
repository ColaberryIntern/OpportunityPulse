module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const MonetizationAngle = sequelize.define('MonetizationAngle', {
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
    minValueThreshold: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: 'min_value_threshold',
    },
  }, {
    tableName: 'monetization_angles',
    timestamps: true,
    underscored: true,
  });

  MonetizationAngle.associate = (models) => {
    MonetizationAngle.hasMany(models.OpportunityClassification, { foreignKey: 'monetization_angle_id', as: 'classifications' });
  };

  return MonetizationAngle;
};
