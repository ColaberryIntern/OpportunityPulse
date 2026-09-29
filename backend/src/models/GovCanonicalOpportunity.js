module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  // Opaque, stable identity for one NOTICE. Never derived from title or
  // solicitation number; both change under us and neither is a key.
  return sequelize.define('GovCanonicalOpportunity', {
    canonicalId: {
      type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, field: 'canonical_id',
    },
    sourceSystem: { type: DataTypes.TEXT, allowNull: false, field: 'source_system' },
    // Advances only when SOURCE facts change. Deliberately independent of
    // enrichment_version, which tracks model output.
    sourceSnapshotVersion: {
      type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'source_snapshot_version',
    },
  }, { tableName: 'gov_canonical_opportunities', timestamps: true, underscored: true });
};
