// Deep Research Phase 12 — storage asset migration job log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const AssetMigration = sequelize.define('AssetMigration', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    storageAssetId: { type: DataTypes.INTEGER, allowNull: false, field: 'storage_asset_id' },
    fromProvider: { type: DataTypes.STRING(32), allowNull: false, field: 'from_provider' },
    toProvider: { type: DataTypes.STRING(32), allowNull: false, field: 'to_provider' },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    sourceRef: { type: DataTypes.STRING(1024), allowNull: true, field: 'source_ref' },
    targetBucket: { type: DataTypes.STRING(255), allowNull: true, field: 'target_bucket' },
    targetKey: { type: DataTypes.STRING(512), allowNull: true, field: 'target_key' },
    bytes: { type: DataTypes.INTEGER, allowNull: true },
    sourceHash: { type: DataTypes.STRING(128), allowNull: true, field: 'source_hash' },
    targetHash: { type: DataTypes.STRING(128), allowNull: true, field: 'target_hash' },
    attempt: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  }, { tableName: 'asset_migrations', timestamps: true, underscored: true });
  return AssetMigration;
};
