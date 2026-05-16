// Deep Research Phase 10 — file storage registry (s3 / minio / local / url_only).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const StorageAsset = sequelize.define('StorageAsset', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    assetKind: { type: DataTypes.STRING(40), allowNull: false, field: 'asset_kind' },
    provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'url_only' },
    bucket: { type: DataTypes.STRING(200), allowNull: true },
    key: { type: DataTypes.STRING(1000), allowNull: false },
    filename: { type: DataTypes.STRING(500), allowNull: true },
    mimeType: { type: DataTypes.STRING(120), allowNull: true, field: 'mime_type' },
    sizeBytes: { type: DataTypes.INTEGER, allowNull: true, field: 'size_bytes' },
    checksum: { type: DataTypes.STRING(120), allowNull: true },
    visibility: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'admin' },
    retentionDays: { type: DataTypes.INTEGER, allowNull: true, field: 'retention_days' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    rfpAttachmentId: { type: DataTypes.INTEGER, allowNull: true, field: 'rfp_attachment_id' },
    proposalArtifactId: { type: DataTypes.INTEGER, allowNull: true, field: 'proposal_artifact_id' },
    submissionPackageId: { type: DataTypes.INTEGER, allowNull: true, field: 'submission_package_id' },
    uploadedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'uploaded_by' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
  }, {
    tableName: 'storage_assets', timestamps: true, underscored: true,
    indexes: [{ fields: ['asset_kind'] }, { fields: ['pursuit_id'] }],
  });
  return StorageAsset;
};
