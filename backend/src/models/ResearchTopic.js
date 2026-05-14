// Research Intelligence Phase 2.3 — research_topics.
// Aggregation row per topic (arXiv category / tag) with a momentum signal.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ResearchTopic = sequelize.define('ResearchTopic', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    topicName: { type: DataTypes.STRING(200), allowNull: false, field: 'topic_name' },
    paperCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'paper_count' },
    recentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'recent_count' },
    priorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'prior_count' },
    momentumScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true, field: 'momentum_score' },
    growthRate: { type: DataTypes.DECIMAL(6, 2), allowNull: true, field: 'growth_rate' },
    commercialScore: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'commercial_score' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    lastComputedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_computed_at' },
  }, {
    tableName: 'research_topics',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['topic_name'] },
      { fields: ['momentum_score'] },
    ],
  });

  return ResearchTopic;
};
