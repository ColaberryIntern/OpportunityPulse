// Deep Research Phase 7 — reusable proposal acceleration assets (past wins,
// capability blurbs, staffing/pricing templates, NAICS matches, agency history).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ProposalAccelerationAsset = sequelize.define('ProposalAccelerationAsset', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    assetKind: { type: DataTypes.STRING(40), allowNull: false, field: 'asset_kind' },
    label: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: true },
    tags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    sourceKind: { type: DataTypes.STRING(40), allowNull: true, field: 'source_kind' },
    sourceId: { type: DataTypes.INTEGER, allowNull: true, field: 'source_id' },
    strength: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'proposal_acceleration_assets', timestamps: false, underscored: true,
    indexes: [{ fields: ['asset_kind'] }],
  });
  return ProposalAccelerationAsset;
};
