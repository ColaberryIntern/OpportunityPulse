module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  // LINKING, not deduplication. A family groups notices about one procurement
  // (sources-sought -> solicitation -> award) without collapsing them.
  return sequelize.define('GovSolicitationFamily', {
    familyId: {
      type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, field: 'family_id',
    },
    solicitationNumber: { type: DataTypes.TEXT, allowNull: true, field: 'solicitation_number' },
    linkBasis: { type: DataTypes.TEXT, allowNull: false, field: 'link_basis' },
    confidence: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'medium' },
  }, { tableName: 'gov_solicitation_families', timestamps: true, updatedAt: false, underscored: true });
};
