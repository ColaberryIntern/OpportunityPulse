// Deep Research Phase 13 — denormalized operational-lineage graph edge.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('OperationalLineage', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    fromKind: { type: DataTypes.STRING(64), allowNull: false, field: 'from_kind' },
    fromId: { type: DataTypes.STRING(128), allowNull: false, field: 'from_id' },
    toKind: { type: DataTypes.STRING(64), allowNull: false, field: 'to_kind' },
    toId: { type: DataTypes.STRING(128), allowNull: false, field: 'to_id' },
    relation: { type: DataTypes.STRING(64), allowNull: false },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    weight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'operational_lineage', timestamps: true, underscored: true, updatedAt: false });
};
