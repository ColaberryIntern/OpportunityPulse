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
