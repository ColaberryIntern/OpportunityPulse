// Research Intelligence Phase 2.3 — research_authors.
// Aggregation row per distinct author name across research opportunities.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ResearchAuthor = sequelize.define('ResearchAuthor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(300), allowNull: false },
    institution: { type: DataTypes.STRING(300), allowNull: true },
    linkedinUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'linkedin_url' },
    githubUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'github_url' },
    paperCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'paper_count' },
    citationCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'citation_count' },
    hIndex: { type: DataTypes.INTEGER, allowNull: true, field: 'h_index' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    lastSeenAt: { type: DataTypes.DATE, allowNull: true, field: 'last_seen_at' },
  }, {
    tableName: 'research_authors',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['name'] },
      { fields: ['citation_count'] },
      { fields: ['paper_count'] },
    ],
  });

  return ResearchAuthor;
};
