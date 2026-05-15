// Deep Research Phase 4 — one row per (venture_a, venture_b) pair with
// detected shared components — the shared-build opportunity surface.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const InfrastructureOverlap = sequelize.define('InfrastructureOverlap', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureAId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_a_id' },
    ventureBId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_b_id' },
    overlapScore: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0, field: 'overlap_score' },
    sharedComponents: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'shared_components' },
  }, {
    tableName: 'infrastructure_overlap',
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ['venture_a_id', 'venture_b_id'] }],
  });
  return InfrastructureOverlap;
};
