// Deep Research Phase 3 — the execution readiness assessment for a venture
// idea: "can Colaberry realistically execute this?" Deterministic scoring.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ExecutionReadiness = sequelize.define('ExecutionReadiness', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    executionReadinessScore: {
      type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'execution_readiness_score',
    },
    mvpTimelineWeeks: { type: DataTypes.INTEGER, allowNull: true, field: 'mvp_timeline_weeks' },
    technicalComplexity: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'technical_complexity' },
    aiDependencyRisk: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'ai_dependency_risk' },
    marketReadiness: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'market_readiness' },
    operationalReadiness: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'operational_readiness' },
    staffing: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    infrastructure: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    breakdown: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    rationale: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'execution_readiness',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }],
  });

  ExecutionReadiness.associate = (models) => {
    ExecutionReadiness.belongsTo(models.VentureIdea, { foreignKey: 'venture_idea_id', as: 'ventureIdea' });
  };

  return ExecutionReadiness;
};
