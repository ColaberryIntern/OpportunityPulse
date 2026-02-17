const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Feedback = sequelize.define('Feedback', {
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
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'platform',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    targetId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'target_id',
    },
  }, {
    tableName: 'feedback',
    timestamps: true,
    underscored: true,
  });

  Feedback.associate = (models) => {
    Feedback.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Feedback;
};
