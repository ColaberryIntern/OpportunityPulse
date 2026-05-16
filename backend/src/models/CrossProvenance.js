// Deep Research Phase 13 — unified cross-system provenance log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('CrossProvenance', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    subjectKind: { type: DataTypes.STRING(64), allowNull: false, field: 'subject_kind' },
    subjectId: { type: DataTypes.STRING(128), allowNull: false, field: 'subject_id' },
    provenanceKind: { type: DataTypes.STRING(64), allowNull: false, field: 'provenance_kind' },
    sourceKind: { type: DataTypes.STRING(64), allowNull: true, field: 'source_kind' },
    sourceId: { type: DataTypes.STRING(128), allowNull: true, field: 'source_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    actorEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'actor_email' },
    summary: { type: DataTypes.STRING(512), allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'cross_provenance', timestamps: true, underscored: true, updatedAt: false });
};
