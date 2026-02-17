const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserActivity = sequelize.define('UserActivity', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },
    action: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'user_activity',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // activity records are immutable
    underscored: true,
  });

  UserActivity.associate = (models) => {
    UserActivity.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return UserActivity;
};
