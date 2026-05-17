// Deep Research Phase 15 — Operations Intelligence Center composite snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('OperationalIntelligence', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    overallScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'overall_score' },
    qualityScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'quality_score' },
    lineageIntegrityScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'lineage_integrity_score' },
    qaWorkflowScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'qa_workflow_score' },
    governanceHealthScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'governance_health_score' },
    trendDirection: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'flat', field: 'trend_direction' },
    computedInputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'computed_inputs' },
  }, { tableName: 'operational_intelligence', timestamps: true, underscored: true, updatedAt: false });
};
