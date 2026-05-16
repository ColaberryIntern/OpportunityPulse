// Deep Research Phase 9 — RFP attachment locker metadata.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const RfpAttachment = sequelize.define('RfpAttachment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: true, field: 'opportunity_id' },
    attachmentKind: { type: DataTypes.STRING(40), allowNull: false, field: 'attachment_kind' },
    label: { type: DataTypes.STRING(300), allowNull: false },
    filename: { type: DataTypes.STRING(500), allowNull: true },
    contentRef: { type: DataTypes.STRING(1000), allowNull: true, field: 'content_ref' },
    mimeType: { type: DataTypes.STRING(120), allowNull: true, field: 'mime_type' },
    sizeBytes: { type: DataTypes.INTEGER, allowNull: true, field: 'size_bytes' },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    tags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    relatedAttachmentIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'related_attachment_ids' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
    uploadedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'uploaded_by' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'rfp_attachments', timestamps: true, underscored: true,
    indexes: [
      { fields: ['pursuit_id'] }, { fields: ['opportunity_id'] }, { fields: ['attachment_kind'] },
    ],
  });
  return RfpAttachment;
};
