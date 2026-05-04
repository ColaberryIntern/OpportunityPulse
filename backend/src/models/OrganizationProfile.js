module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // One row per organization (renamed from user_profiles in v4 migration
  // 20260506000001). user_id is kept around as nullable for audit / older
  // queries — new writes set organization_id only.
  const OrganizationProfile = sequelize.define('OrganizationProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'organization_id',
    },
    userId:        { type: DataTypes.INTEGER, allowNull: true, field: 'user_id' },
    services:      { type: DataTypes.JSONB,   defaultValue: [] },
    industries:    { type: DataTypes.JSONB,   defaultValue: [] },
    minDealSize:   { type: DataTypes.INTEGER, defaultValue: 0, field: 'min_deal_size' },
    tools:         { type: DataTypes.JSONB,   defaultValue: [] },
    pastWins:      { type: DataTypes.JSONB,   defaultValue: [], field: 'past_wins' },
    riskTolerance: {
      type: DataTypes.STRING(20),
      defaultValue: 'medium',
      field: 'risk_tolerance',
      validate: { isIn: [['low', 'medium', 'high']] },
    },
    preferences:   { type: DataTypes.JSONB, defaultValue: {} },
  }, {
    tableName: 'organization_profiles',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['organization_id'], unique: true, name: 'idx_org_profiles_org_id' }],
  });

  return OrganizationProfile;
};
