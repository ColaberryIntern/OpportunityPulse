// Deep Research Phase 10 — append-only artifact lifecycle event log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ArtifactLifecycleEvent = sequelize.define('ArtifactLifecycleEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proposalArtifactId: { type: DataTypes.INTEGER, allowNull: false, field: 'proposal_artifact_id' },
    eventKind: { type: DataTypes.STRING(30), allowNull: false, field: 'event_kind' },
    detail: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
  }, {
    tableName: 'artifact_lifecycle_events', timestamps: true, updatedAt: false, underscored: true,
    indexes: [{ fields: ['proposal_artifact_id'] }, { fields: ['event_kind'] }],
  });
  return ArtifactLifecycleEvent;
};
