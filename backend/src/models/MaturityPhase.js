module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const MaturityPhase = sequelize.define('MaturityPhase', {
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
    typicalTimeframe: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'typical_timeframe',
    },
  }, {
    tableName: 'maturity_phases',
    timestamps: true,
    underscored: true,
  });

  MaturityPhase.associate = (models) => {
    MaturityPhase.hasMany(models.OpportunityClassification, { foreignKey: 'maturity_phase_id', as: 'classifications' });
  };

  return MaturityPhase;
};
