const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Dashboard = sequelize.define('Dashboard', {
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
    metrics: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'dashboard',
    timestamps: true,
    underscored: true,
  });

  Dashboard.associate = (models) => {
    Dashboard.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Dashboard;
};
