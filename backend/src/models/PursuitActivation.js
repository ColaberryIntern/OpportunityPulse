// Deep Research Phase 8 — audit row for every pursuit-activation event.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const PursuitActivation = sequelize.define('PursuitActivation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: false, field: 'pursuit_id' },
    sourceKind: { type: DataTypes.STRING(30), allowNull: false, field: 'source_kind' },
    sourceId: { type: DataTypes.STRING(200), allowNull: true, field: 'source_id' },
    attachedCounts: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'attached_counts' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    actor: { type: DataTypes.STRING(120), allowNull: true },
  }, {
    tableName: 'pursuit_activations', timestamps: true, updatedAt: false, underscored: true,
    indexes: [{ fields: ['pursuit_id'] }, { fields: ['source_kind'] }],
  });
  return PursuitActivation;
};
