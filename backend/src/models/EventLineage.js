// Deep Research Phase 11 — directed edge between domain entities for traceability.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const EventLineage = sequelize.define('EventLineage', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    fromKind: { type: DataTypes.STRING(64), allowNull: false, field: 'from_kind' },
    fromId: { type: DataTypes.STRING(128), allowNull: false, field: 'from_id' },
    toKind: { type: DataTypes.STRING(64), allowNull: false, field: 'to_kind' },
    toId: { type: DataTypes.STRING(128), allowNull: false, field: 'to_id' },
    edgeKind: { type: DataTypes.STRING(64), allowNull: false, field: 'edge_kind' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'event_lineage', timestamps: true, underscored: true, updatedAt: false,
  });
  return EventLineage;
};
