const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Comment = sequelize.define('Comment', {
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
    forumPostId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'forum_post_id',
      references: {
        model: 'forum_posts',
        key: 'id',
      },
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  }, {
    tableName: 'comments',
    timestamps: true,
    underscored: true,
  });

  Comment.associate = (models) => {
    Comment.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
    Comment.belongsTo(models.ForumPost, { foreignKey: 'forum_post_id', as: 'post' });
  };

  return Comment;
};
