// Deep Research Phase 6 — workflow log on Phase 5 dependency_edges
// (approve / reject / annotate / assign_owner / resolve). Append-only.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const DependencyReview = sequelize.define('DependencyReview', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    dependencyEdgeId: { type: DataTypes.INTEGER, allowNull: false, field: 'dependency_edge_id' },
    action: { type: DataTypes.STRING(30), allowNull: false },
    owner: { type: DataTypes.STRING(120), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    actor: { type: DataTypes.STRING(120), allowNull: true },
  }, {
    tableName: 'dependency_reviews', timestamps: true, updatedAt: false, underscored: true,
    indexes: [{ fields: ['dependency_edge_id'] }],
  });
  return DependencyReview;
};
