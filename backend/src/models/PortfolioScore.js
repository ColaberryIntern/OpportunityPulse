// Deep Research Phase 4 — portfolio prioritization engine output.
// One row per venture per refresh run.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const PortfolioScore = sequelize.define('PortfolioScore', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    portfolioScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'portfolio_score' },
    portfolioRank: { type: DataTypes.INTEGER, allowNull: true, field: 'portfolio_rank' },
    sequencingRecommendation: { type: DataTypes.STRING(40), allowNull: true, field: 'sequencing_recommendation' },
    factors: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    runId: { type: DataTypes.STRING(60), allowNull: false, field: 'run_id' },
  }, {
    tableName: 'portfolio_scores',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }, { fields: ['run_id'] }],
  });
  return PortfolioScore;
};
