module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // One row per user. The unique index on user_id is enforced at the DB
  // layer (migration). All JSONB fields default to [] / {} so a row with
  // only a user_id is a valid empty profile.
  const UserProfile = sequelize.define('UserProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:        { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
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
    tableName: 'user_profiles',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['user_id'], unique: true }],
  });

  return UserProfile;
};
