// Deep Research Phase 3 — a structured MVP plan for a venture idea: scope,
// phased features, stack, timeline, AI components, staffing.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const MvpPlan = sequelize.define('MvpPlan', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    mvpScope: { type: DataTypes.TEXT, allowNull: true, field: 'mvp_scope' },
    phase1Features: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'phase_1_features' },
    fastLaunchFeatures: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'fast_launch_features' },
    futureRoadmap: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'future_roadmap' },
    suggestedArchitecture: { type: DataTypes.TEXT, allowNull: true, field: 'suggested_architecture' },
    suggestedStack: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'suggested_stack' },
    recommendedAiComponents: {
      type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'recommended_ai_components',
    },
    staffing: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    estimatedTimelineWeeks: { type: DataTypes.INTEGER, allowNull: true, field: 'estimated_timeline_weeks' },
    generatedBy: { type: DataTypes.STRING(60), allowNull: true, field: 'generated_by' },
  }, {
    tableName: 'mvp_plans',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }],
  });

  MvpPlan.associate = (models) => {
    MvpPlan.belongsTo(models.VentureIdea, { foreignKey: 'venture_idea_id', as: 'ventureIdea' });
  };

  return MvpPlan;
};
