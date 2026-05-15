// Deep Research Phase 7 — opportunity graph edges (entities → entities).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const OpportunityGraphEdge = sequelize.define('OpportunityGraphEdge', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fromKind: { type: DataTypes.STRING(30), allowNull: false, field: 'from_kind' },
    fromValue: { type: DataTypes.STRING(300), allowNull: false, field: 'from_value' },
    toKind: { type: DataTypes.STRING(30), allowNull: false, field: 'to_kind' },
    toValue: { type: DataTypes.STRING(300), allowNull: false, field: 'to_value' },
    edgeType: { type: DataTypes.STRING(40), allowNull: false, field: 'edge_type' },
    weight: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 1 },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'opportunity_graph_edges', timestamps: false, underscored: true,
    indexes: [
      { fields: ['from_kind', 'from_value'] },
      { fields: ['to_kind', 'to_value'] },
      { fields: ['edge_type'] },
    ],
  });
  return OpportunityGraphEdge;
};
