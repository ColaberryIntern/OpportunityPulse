// Deep Research Phase 11 — per-organization governance overrides.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const TenantSettings = sequelize.define('TenantSettings', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'organization_id' },
    displayName: { type: DataTypes.STRING(255), allowNull: true, field: 'display_name' },
    governanceMode: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'standard', field: 'governance_mode' },
    slaThresholds: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'sla_thresholds' },
    approvalRequiredFor: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'approval_required_for' },
    storageProvider: { type: DataTypes.STRING(32), allowNull: true, field: 'storage_provider' },
    featureFlags: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'feature_flags' },
    retentionDays: { type: DataTypes.INTEGER, allowNull: true, field: 'retention_days' },
  }, {
    tableName: 'tenant_settings', timestamps: true, underscored: true,
  });
  return TenantSettings;
};
