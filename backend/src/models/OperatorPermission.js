// Deep Research Phase 11 — fine-grained per-user permission overlay.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const OperatorPermission = sequelize.define('OperatorPermission', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    roleName: { type: DataTypes.STRING(64), allowNull: false, field: 'role_name' },
    permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    grantedBy: { type: DataTypes.STRING(255), allowNull: true, field: 'granted_by' },
    grantedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'granted_at' },
    revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
  }, {
    tableName: 'operator_permissions', timestamps: true, underscored: true,
  });
  return OperatorPermission;
};
