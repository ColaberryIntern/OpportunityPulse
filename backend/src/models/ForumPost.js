const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ForumPost = sequelize.define('ForumPost', {
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
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'general',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'open',
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'view_count',
    },
  }, {
    tableName: 'forum_posts',
    timestamps: true,
    underscored: true,
  });

  ForumPost.associate = (models) => {
    ForumPost.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
    ForumPost.hasMany(models.Comment, { foreignKey: 'forum_post_id', as: 'comments' });
  };

  return ForumPost;
};
