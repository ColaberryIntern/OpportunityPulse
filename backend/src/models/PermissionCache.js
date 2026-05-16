// Deep Research Phase 12 — short-TTL effective-permission cache.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const PermissionCache = sequelize.define('PermissionCache', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'user_id' },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    roleName: { type: DataTypes.STRING(64), allowNull: false, field: 'role_name' },
    roleLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'role_level' },
    effectivePermissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'effective_permissions' },
    cachedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'cached_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
  }, { tableName: 'permission_cache', timestamps: true, underscored: true });
  return PermissionCache;
};
