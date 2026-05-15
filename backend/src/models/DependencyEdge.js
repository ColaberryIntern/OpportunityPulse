// Deep Research Phase 5 — DIRECTIONAL dependency edges. A → B means A
// blocks B until A ships X. Separate from Phase 4 venture_dependencies
// (which is symmetric coupling, not strict precedence).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const DependencyEdge = sequelize.define('DependencyEdge', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    blockerVentureId: { type: DataTypes.INTEGER, allowNull: false, field: 'blocker_venture_id' },
    blockedVentureId: { type: DataTypes.INTEGER, allowNull: false, field: 'blocked_venture_id' },
    dependencyType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'sequencing', field: 'dependency_type' },
    prerequisite: { type: DataTypes.TEXT, allowNull: true },
    cascadeRisk: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'cascade_risk' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposed' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'dependency_edges', timestamps: true, underscored: true,
    indexes: [
      { fields: ['blocker_venture_id'] }, { fields: ['blocked_venture_id'] },
      { unique: true, fields: ['blocker_venture_id', 'blocked_venture_id', 'dependency_type'] },
    ],
  });
  return DependencyEdge;
};
