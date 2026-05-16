// Deep Research Phase 13 — periodic permission integrity audit snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('PermissionIntegrity', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    snapshotAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'snapshot_at' },
    totalUsers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_users' },
    mappedUsers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'mapped_users' },
    overPermissionedUsers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'over_permissioned_users' },
    orphanGrants: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'orphan_grants' },
    staleGrants: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'stale_grants' },
    integrityScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'integrity_score' },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'permission_integrity', timestamps: true, underscored: true, updatedAt: false });
};
