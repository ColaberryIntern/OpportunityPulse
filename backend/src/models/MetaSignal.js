module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const MetaSignal = sequelize.define('MetaSignal', {
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
    currentValue: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'current_value',
    },
    previousValue: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'previous_value',
    },
    trendDirection: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'trend_direction',
    },
    computedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'computed_at',
    },
  }, {
    tableName: 'meta_signals',
    timestamps: true,
    underscored: true,
  });

  MetaSignal.associate = (models) => {
    MetaSignal.hasMany(models.OpportunityClassification, { foreignKey: 'meta_signal_id', as: 'classifications' });
  };

  return MetaSignal;
};
