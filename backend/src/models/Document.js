// Submission Readiness Engine v0.1 — Document model.
//
// One row per uploaded evergreen document (W-9, COI, capability statement,
// past performance, certifications, etc.). Bonfire readiness counts a
// document type as "satisfied" when there is at least one active row of
// that type for the organization.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const Document = sequelize.define('Document', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    organizationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'organization_id',
    },
    type: {
      type: DataTypes.STRING(60),
      allowNull: false,
      // Keep validation soft (CHECK isn't enforced in JS) — the controller
      // gates against the canonical list. Stored as STRING so we can add
      // new types without a migration.
    },
    name: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    filePath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'file_path',
    },
    mime: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    sizeBytes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'size_bytes',
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    uploadedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'uploaded_by',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    // v0.3: local vs global scope. 'global' = traditional vault doc;
    // 'bid' = local to one Bonfire opportunity (scope_id holds the UUID).
    scope: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'global',
    },
    scopeId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'scope_id',
    },
    // v0.3: links a local bid-scoped row to its global version-history twin
    // when AI generates a doc. Both rows share the same lineage_id so we
    // can analyze + improve generation quality across the org.
    lineageId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'lineage_id',
    },
    source: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'manual',
      // 'manual' | 'ai_generated' | 'ai_promoted'
    },
  }, {
    tableName: 'documents',
    timestamps: true,
    underscored: true,
  });

  return Document;
};
