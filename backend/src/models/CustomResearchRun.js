// Deep Research Phase 7 — user-saved strategic search runs.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const CustomResearchRun = sequelize.define('CustomResearchRun', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    query: { type: DataTypes.STRING(500), allowNull: false },
    filters: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    lastRunAt: { type: DataTypes.DATE, allowNull: true, field: 'last_run_at' },
    lastMatchCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'last_match_count' },
    lastResults: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'last_results' },
    lastBreakdown: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'last_breakdown' },
    history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdBy: { type: DataTypes.STRING(120), allowNull: true, field: 'created_by' },
  }, {
    tableName: 'custom_research_runs', timestamps: true, underscored: true,
    indexes: [{ fields: ['pinned'] }],
  });
  return CustomResearchRun;
};
