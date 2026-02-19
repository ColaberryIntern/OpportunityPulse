module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const PersonalMatch = sequelize.define('PersonalMatch', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'opportunity_id',
      references: { model: 'opportunities', key: 'id' },
    },
    matchScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'match_score',
      validate: { min: 0, max: 100 },
    },
    matchReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'match_reason',
    },
    actionSuggestion: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'action_suggestion',
    },
    strengthAreas: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'strength_areas',
    },
    gapAreas: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'gap_areas',
    },
    feedback: {
      type: DataTypes.ENUM('helpful', 'not_helpful'),
      allowNull: true,
    },
    computedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'computed_at',
    },
  }, {
    tableName: 'personal_matches',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id', 'opportunity_id'], unique: true },
      { fields: ['user_id', 'match_score'] },
    ],
  });

  PersonalMatch.associate = (models) => {
    PersonalMatch.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    PersonalMatch.belongsTo(models.Opportunity, { foreignKey: 'opportunity_id', as: 'opportunity' });
  };

  return PersonalMatch;
};
