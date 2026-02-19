module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const StrategicIntent = sequelize.define('StrategicIntent', {
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
    signalType: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'signal_type',
    },
    weight: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 1.00,
    },
  }, {
    tableName: 'strategic_intents',
    timestamps: true,
    underscored: true,
  });

  StrategicIntent.associate = (models) => {
    StrategicIntent.hasMany(models.OpportunityClassification, { foreignKey: 'strategic_intent_id', as: 'classifications' });
    StrategicIntent.hasMany(models.StrategicCluster, { foreignKey: 'intent_id', as: 'clusters' });
  };

  return StrategicIntent;
};
