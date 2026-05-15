// Deep Research Phase 7 — cached drilldown view per strategic cluster.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ClusterDrilldown = sequelize.define('ClusterDrilldown', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    clusterId: { type: DataTypes.INTEGER, allowNull: false, field: 'cluster_id' },
    opportunityCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'opportunity_count' },
    themes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    agencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    technologies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    vendors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    naics: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    strategicLanguage: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'strategic_language' },
    sources: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    sampleOpportunityIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'sample_opportunity_ids' },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'cluster_drilldowns', timestamps: false, underscored: true,
    indexes: [{ fields: ['cluster_id'] }],
  });
  return ClusterDrilldown;
};
