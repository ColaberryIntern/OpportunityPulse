// Deep Research Phase 12 — audit-trail cold-storage archive manifest.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const AuditArchive = sequelize.define('AuditArchive', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    windowStart: { type: DataTypes.DATE, allowNull: false, field: 'window_start' },
    windowEnd: { type: DataTypes.DATE, allowNull: false, field: 'window_end' },
    recordCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'record_count' },
    bytesArchived: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'bytes_archived' },
    archiveLocation: { type: DataTypes.STRING(1024), allowNull: true, field: 'archive_location' },
    archiveHash: { type: DataTypes.STRING(128), allowNull: true, field: 'archive_hash' },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  }, { tableName: 'audit_archives', timestamps: true, underscored: true, updatedAt: false });
  return AuditArchive;
};
