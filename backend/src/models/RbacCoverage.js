// Deep Research Phase 12 — periodic RBAC route-coverage snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const RbacCoverage = sequelize.define('RbacCoverage', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    snapshotAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'snapshot_at' },
    totalRoutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_routes' },
    legacyAdminRoutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'legacy_admin_routes' },
    requiresPermissionRoutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'requires_permission_routes' },
    unprotectedRoutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'unprotected_routes' },
    coveragePct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'coverage_pct' },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'rbac_coverage', timestamps: true, underscored: true, updatedAt: false });
  return RbacCoverage;
};
