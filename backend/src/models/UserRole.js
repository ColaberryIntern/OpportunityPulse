const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserRole = sequelize.define('UserRole', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    roleName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'role_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'user_roles',
    timestamps: true,
    underscored: true,
  });

  UserRole.associate = (models) => {
    UserRole.hasMany(models.User, { foreignKey: 'role_id', as: 'users' });
  };

  return UserRole;
};
