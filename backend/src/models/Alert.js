module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const Alert = sequelize.define('Alert', {
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
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [['new_opportunity', 'score_change', 'trend_alert', 'system']],
      },
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'opportunity_id',
      references: { model: 'opportunities', key: 'id' },
    },
    severity: {
      type: DataTypes.STRING(20),
      defaultValue: 'info',
      validate: {
        isIn: [['info', 'warning', 'important']],
      },
    },
    read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'alerts',
    timestamps: true,
    updatedAt: false,
    underscored: true,
  });

  Alert.associate = (models) => {
    Alert.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Alert.belongsTo(models.Opportunity, { foreignKey: 'opportunity_id', as: 'opportunity' });
  };

  return Alert;
};
