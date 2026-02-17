const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subscription = sequelize.define('Subscription', {
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
    planType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'plan_type',
      validate: {
        isIn: [['free', 'premium']],
      },
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date',
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'end_date',
    },
  }, {
    tableName: 'subscriptions',
    timestamps: true,
    underscored: true,
  });

  Subscription.associate = (models) => {
    Subscription.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Subscription;
};
