module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const BehaviorProfile = sequelize.define('BehaviorProfile', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    interestScores: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'interest_scores',
    },
    categoryPreferences: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'category_preferences',
    },
    tagAffinities: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'tag_affinities',
    },
    searchPatterns: {
      type: DataTypes.JSONB,
      defaultValue: { recentQueries: [], topTerms: {} },
      field: 'search_patterns',
    },
    engagementMetrics: {
      type: DataTypes.JSONB,
      defaultValue: { avgTimeSpent: 0, totalViews: 0, totalClicks: 0 },
      field: 'engagement_metrics',
    },
    lastComputedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_computed_at',
    },
  }, {
    tableName: 'behavior_profiles',
    timestamps: true,
    underscored: true,
  });

  BehaviorProfile.associate = (models) => {
    BehaviorProfile.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return BehaviorProfile;
};
