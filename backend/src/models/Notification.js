module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const Notification = sequelize.define('Notification', {
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
        isIn: [['alert', 'forum_reply', 'opportunity_match', 'subscription', 'system']],
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
    read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'notifications',
    timestamps: true,
    updatedAt: false,
    underscored: true,
  });

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Notification;
};
