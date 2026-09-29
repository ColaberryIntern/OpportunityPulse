module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  // Records duplicates rather than merging them away. Several aliases may point
  // at one canonical record; the notices keep their own identities.
  return sequelize.define('GovSourceAlias', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    canonicalId: { type: DataTypes.UUID, allowNull: false, field: 'canonical_id' },
    idType: { type: DataTypes.TEXT, allowNull: false, field: 'id_type' },
    idValue: { type: DataTypes.TEXT, allowNull: false, field: 'id_value' },
    observedAt: { type: DataTypes.DATE, allowNull: false, field: 'observed_at' },
    note: { type: DataTypes.TEXT, allowNull: true },
  }, { tableName: 'gov_source_aliases', timestamps: false, underscored: true });
};
