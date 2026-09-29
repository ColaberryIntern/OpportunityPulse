module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  // Append-only. A BEFORE UPDATE/DELETE trigger enforces immutability in the
  // database, so this is not merely a convention the application can forget.
  return sequelize.define('GovSourceSnapshot', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    canonicalId: { type: DataTypes.UUID, allowNull: false, field: 'canonical_id' },
    sourceSnapshotVersion: {
      type: DataTypes.INTEGER, allowNull: false, field: 'source_snapshot_version',
    },
    // Hash over SOURCE facts only. Enrichment output must not advance a source
    // snapshot version.
    contentHash: { type: DataTypes.TEXT, allowNull: false, field: 'content_hash' },
    fetchAttemptedAt: { type: DataTypes.DATE, allowNull: true, field: 'fetch_attempted_at' },
    fetchStatus: { type: DataTypes.TEXT, allowNull: false, field: 'fetch_status' },
    fetchError: { type: DataTypes.TEXT, allowNull: true, field: 'fetch_error' },
    // NULL on a failed fetch: an attempt is not an observation.
    observedAt: { type: DataTypes.DATE, allowNull: true, field: 'observed_at' },
    payload: { type: DataTypes.JSONB, allowNull: false },
  }, { tableName: 'gov_source_snapshots', timestamps: true, updatedAt: false, underscored: true });
};
