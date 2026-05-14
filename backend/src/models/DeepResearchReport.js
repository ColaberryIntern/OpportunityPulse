// Deep Research Intelligence Engine — a synthesized venture-intelligence
// report built from cross-channel opportunity data. One row per search
// term (manual) or scan topic (daily automated scan).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const DeepResearchReport = sequelize.define('DeepResearchReport', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    searchTerm: { type: DataTypes.STRING(300), allowNull: false, field: 'search_term' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'running' },
    executiveSummary: { type: DataTypes.TEXT, allowNull: true, field: 'executive_summary' },
    marketStage: { type: DataTypes.STRING(40), allowNull: true, field: 'market_stage' },
    confidenceScore: { type: DataTypes.DECIMAL(4, 3), allowNull: true, field: 'confidence_score' },
    reportJson: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'report_json' },
    sourceCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'source_count' },
    origin: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'manual' },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
    analysisRunId: { type: DataTypes.INTEGER, allowNull: true, field: 'analysis_run_id' },
    error: { type: DataTypes.TEXT, allowNull: true },
    // Phase 2 — versioning + management + denormalized intelligence scores.
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    isFavorite: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_favorite' },
    isArchived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_archived' },
    timingScore: { type: DataTypes.DECIMAL(4, 3), allowNull: true, field: 'timing_score' },
    commercializationScore: {
      type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'commercialization_score',
    },
    correlationStrength: {
      type: DataTypes.DECIMAL(4, 3), allowNull: true, field: 'correlation_strength',
    },
  }, {
    tableName: 'deep_research_reports',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['created_at'] },
      { fields: ['search_term'] },
      { fields: ['status'] },
    ],
  });

  DeepResearchReport.associate = (models) => {
    DeepResearchReport.hasMany(models.VentureIdea, {
      foreignKey: 'report_id',
      as: 'ventureIdeas',
    });
    DeepResearchReport.hasMany(models.MonetizationModel, {
      foreignKey: 'report_id',
      as: 'monetizationModels',
    });
    DeepResearchReport.hasOne(models.SignalCorrelation, {
      foreignKey: 'report_id',
      as: 'signalCorrelation',
    });
    DeepResearchReport.hasMany(models.ReportVersion, {
      foreignKey: 'report_id',
      as: 'versions',
    });
  };

  return DeepResearchReport;
};
