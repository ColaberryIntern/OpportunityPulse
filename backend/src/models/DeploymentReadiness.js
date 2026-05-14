// Deep Research Phase 3 — the deployment readiness classification for a
// venture idea: prototype / mvp / production / enterprise. Deterministic.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const DeploymentReadiness = sequelize.define('DeploymentReadiness', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    readinessLevel: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'prototype', field: 'readiness_level',
    },
    requirementsCompleteness: {
      type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'requirements_completeness',
    },
    architectureQuality: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'architecture_quality' },
    aiDependencyRisk: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'ai_dependency_risk' },
    infrastructureReadiness: {
      type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'infrastructure_readiness',
    },
    complianceExposure: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'compliance_exposure' },
    breakdown: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    rationale: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'deployment_readiness',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }],
  });

  DeploymentReadiness.associate = (models) => {
    DeploymentReadiness.belongsTo(models.VentureIdea, { foreignKey: 'venture_idea_id', as: 'ventureIdea' });
  };

  return DeploymentReadiness;
};
