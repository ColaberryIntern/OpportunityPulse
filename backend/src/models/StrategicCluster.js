module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const StrategicCluster = sequelize.define('StrategicCluster', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    slug: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    domainId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'domain_id',
      references: { model: 'ai_domains', key: 'id' },
    },
    capabilityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'capability_id',
      references: { model: 'ai_capabilities', key: 'id' },
    },
    intentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'intent_id',
      references: { model: 'strategic_intents', key: 'id' },
    },
    opportunityCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'opportunity_count',
    },
    avgAiScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'avg_ai_score',
    },
    growthRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'growth_rate',
    },
    trendVelocity: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'trend_velocity',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    detectedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'detected_at',
    },
  }, {
    tableName: 'strategic_clusters',
    timestamps: true,
    underscored: true,
  });

  StrategicCluster.associate = (models) => {
    StrategicCluster.belongsTo(models.AiDomain, { foreignKey: 'domain_id', as: 'domain' });
    StrategicCluster.belongsTo(models.AiCapability, { foreignKey: 'capability_id', as: 'capability' });
    StrategicCluster.belongsTo(models.StrategicIntent, { foreignKey: 'intent_id', as: 'intent' });
    StrategicCluster.hasMany(models.OpportunityClassification, { foreignKey: 'cluster_id', as: 'classifications' });
  };

  return StrategicCluster;
};
