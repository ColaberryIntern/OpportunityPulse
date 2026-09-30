module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('GovFamilyMember', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    familyId: { type: DataTypes.UUID, allowNull: false, field: 'family_id' },
    canonicalId: { type: DataTypes.UUID, allowNull: false, field: 'canonical_id' },
    addedAt: { type: DataTypes.DATE, allowNull: false, field: 'added_at' },
  }, { tableName: 'gov_family_members', timestamps: false, underscored: true });
};
