const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Content = sequelize.define('Content', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'draft',
      validate: {
        isIn: [['draft', 'published', 'archived']],
      },
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
  }, {
    tableName: 'content',
    timestamps: true,
    underscored: true,
    paranoid: true, // soft delete via deleted_at
  });

  Content.associate = (models) => {
    Content.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
  };

  return Content;
};
