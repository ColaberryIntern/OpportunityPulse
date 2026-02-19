module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const AlertPreference = sequelize.define('AlertPreference', {
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
    govContracts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'gov_contracts',
    },
    aiJobs: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'ai_jobs',
    },
    investments: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    grants: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    aiNews: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'ai_news',
    },
    preferredActionTypes: {
      type: DataTypes.ARRAY(DataTypes.STRING(20)),
      defaultValue: ['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH'],
      field: 'preferred_action_types',
    },
    minScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'min_score',
      validate: {
        min: 0,
        max: 100,
      },
    },
    emailNotify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'email_notify',
    },
    inAppNotify: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'in_app_notify',
    },
    digestFrequency: {
      type: DataTypes.STRING(10),
      defaultValue: 'weekly',
      field: 'digest_frequency',
      validate: {
        isIn: [['daily', 'weekly', 'biweekly', 'monthly']],
      },
    },
    lastDigestSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_digest_sent_at',
    },
  }, {
    tableName: 'alert_preferences',
    timestamps: true,
    underscored: true,
  });

  AlertPreference.associate = (models) => {
    AlertPreference.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return AlertPreference;
};
