// Deep Research Intelligence Engine — a commercializable venture idea
// generated from a deep research report. One report → many venture ideas.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const VentureIdea = sequelize.define('VentureIdea', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reportId: { type: DataTypes.INTEGER, allowNull: false, field: 'report_id' },
    title: { type: DataTypes.STRING(300), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    monetizationStrategy: { type: DataTypes.TEXT, allowNull: true, field: 'monetization_strategy' },
    marketTiming: { type: DataTypes.STRING(40), allowNull: true, field: 'market_timing' },
    buildabilityScore: { type: DataTypes.DECIMAL(4, 3), allowNull: true, field: 'buildability_score' },
    revenuePotential: { type: DataTypes.STRING(40), allowNull: true, field: 'revenue_potential' },
    mvpScope: { type: DataTypes.TEXT, allowNull: true, field: 'mvp_scope' },
    gtmSummary: { type: DataTypes.TEXT, allowNull: true, field: 'gtm_summary' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },
    // Phase 2 — venture scoring engine output.
    compositeScore: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'composite_score' },
    recommendationLevel: {
      type: DataTypes.STRING(20), allowNull: true, field: 'recommendation_level',
    },
    scores: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Phase 3 — execution lifecycle.
    lifecycleState: {
      type: DataTypes.STRING(40), allowNull: false, defaultValue: 'discovered', field: 'lifecycle_state',
    },
    lifecycleOwner: { type: DataTypes.STRING(120), allowNull: true, field: 'lifecycle_owner' },
  }, {
    tableName: 'venture_ideas',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['report_id'] },
    ],
  });

  VentureIdea.associate = (models) => {
    VentureIdea.belongsTo(models.DeepResearchReport, {
      foreignKey: 'report_id',
      as: 'report',
    });
    VentureIdea.hasMany(models.ProjectGenerationJob, {
      foreignKey: 'venture_idea_id',
      as: 'generationJobs',
    });
  };

  return VentureIdea;
};
