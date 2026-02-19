module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const OpportunityClassification = sequelize.define('OpportunityClassification', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'opportunity_id',
      references: { model: 'opportunities', key: 'id' },
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
    strategicIntentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'strategic_intent_id',
      references: { model: 'strategic_intents', key: 'id' },
    },
    monetizationAngleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'monetization_angle_id',
      references: { model: 'monetization_angles', key: 'id' },
    },
    maturityPhaseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'maturity_phase_id',
      references: { model: 'maturity_phases', key: 'id' },
    },
    geographicTagId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'geographic_tag_id',
      references: { model: 'geographic_tags', key: 'id' },
    },
    metaSignalId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'meta_signal_id',
      references: { model: 'meta_signals', key: 'id' },
    },
    clusterId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'cluster_id',
      references: { model: 'strategic_clusters', key: 'id' },
    },
    domainConfidence: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'domain_confidence',
    },
    capabilityConfidence: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'capability_confidence',
    },
    demandScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'demand_score',
    },
    competitionScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'competition_score',
    },
    saturationIndex: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'saturation_index',
    },
    classifiedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'classified_at',
    },
  }, {
    tableName: 'opportunity_classifications',
    timestamps: true,
    underscored: true,
  });

  OpportunityClassification.associate = (models) => {
    OpportunityClassification.belongsTo(models.Opportunity, { foreignKey: 'opportunity_id', as: 'opportunity' });
    OpportunityClassification.belongsTo(models.AiDomain, { foreignKey: 'domain_id', as: 'domain' });
    OpportunityClassification.belongsTo(models.AiCapability, { foreignKey: 'capability_id', as: 'capability' });
    OpportunityClassification.belongsTo(models.StrategicIntent, { foreignKey: 'strategic_intent_id', as: 'strategicIntent' });
    OpportunityClassification.belongsTo(models.MonetizationAngle, { foreignKey: 'monetization_angle_id', as: 'monetizationAngle' });
    OpportunityClassification.belongsTo(models.MaturityPhase, { foreignKey: 'maturity_phase_id', as: 'maturityPhase' });
    OpportunityClassification.belongsTo(models.GeographicTag, { foreignKey: 'geographic_tag_id', as: 'geographicTag' });
    OpportunityClassification.belongsTo(models.MetaSignal, { foreignKey: 'meta_signal_id', as: 'metaSignal' });
    OpportunityClassification.belongsTo(models.StrategicCluster, { foreignKey: 'cluster_id', as: 'cluster' });
  };

  return OpportunityClassification;
};
