// Deep Research Phase 15 — pre-computed BFS lineage graph payload.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('LineageVisualization', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    seedKind: { type: DataTypes.STRING(64), allowNull: false, field: 'seed_kind' },
    seedId: { type: DataTypes.STRING(128), allowNull: false, field: 'seed_id' },
    maxDepth: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3, field: 'max_depth' },
    nodeCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'node_count' },
    edgeCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'edge_count' },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    generatedBy: { type: DataTypes.STRING(255), allowNull: true, field: 'generated_by' },
  }, { tableName: 'lineage_visualizations', timestamps: true, underscored: true, updatedAt: false });
};
