const { ForumPost, Comment, User, sequelize } = require('../models');
const { PAGINATION, ROLES } = require('../config/constants');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Create a new forum post.
 */
async function createPost(userId, { title, body, category }) {
  const post = await ForumPost.create({
    title,
    body,
    category: category || 'general',
    userId,
  });

  const fullPost = await ForumPost.findByPk(post.id, {
    include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
  });

  return fullPost.toJSON();
}

/**
 * List forum posts with optional filters and pagination.
 */
async function listPosts({ page, limit, category, status } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const offset = (safePage - 1) * safeLimit;

  const where = {};
  if (category) where.category = category;
  if (status) where.status = status;

  const { rows, count: total } = await ForumPost.findAndCountAll({
    where,
    attributes: {
      include: [
        [sequelize.literal('(SELECT COUNT(*) FROM comments WHERE comments.forum_post_id = "ForumPost".id)'), 'commentCount'],
      ],
    },
    include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    posts: rows,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Get a single forum post by ID, including comments.
 */
async function getPostById(id) {
  const post = await ForumPost.findByPk(id, {
    include: [
      { model: User, as: 'author', attributes: ['id', 'email', 'name'] },
      {
        model: Comment,
        as: 'comments',
        include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
      },
    ],
  });

  if (!post) {
    throw new AppError('Forum post not found.', 404);
  }

  await post.increment('viewCount');

  return post;
}

/**
 * Update a forum post. Only the owner or an admin can update.
 */
async function updatePost(id, userId, userRole, { title, body, category, status }) {
  const post = await ForumPost.findByPk(id);

  if (!post) {
    throw new AppError('Forum post not found.', 404);
  }

  // Ownership check: only owner or admin
  if (post.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only edit your own posts.', 403);
  }

  if (title !== undefined) post.title = title;
  if (body !== undefined) post.body = body;
  if (category !== undefined) post.category = category;
  if (status !== undefined) post.status = status;

  await post.save();

  return post.toJSON();
}

/**
 * Delete a forum post. Only the owner or an admin can delete.
 * CASCADE will handle associated comments.
 */
async function deletePost(id, userId, userRole) {
  const post = await ForumPost.findByPk(id);

  if (!post) {
    throw new AppError('Forum post not found.', 404);
  }

  if (post.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only delete your own posts.', 403);
  }

  await post.destroy();

  return { message: 'Post deleted.' };
}

/**
 * Add a comment to a forum post.
 */
async function addComment(postId, userId, { body }) {
  const post = await ForumPost.findByPk(postId);

  if (!post) {
    throw new AppError('Forum post not found.', 404);
  }

  if (post.status === 'closed') {
    throw new AppError('Cannot comment on a closed post.', 403);
  }

  const comment = await Comment.create({
    userId,
    forumPostId: postId,
    body,
  });

  const fullComment = await Comment.findByPk(comment.id, {
    include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
  });

  return fullComment.toJSON();
}

/**
 * Update a comment. Only the owner or an admin can update.
 */
async function updateComment(commentId, userId, userRole, { body }) {
  const comment = await Comment.findByPk(commentId);

  if (!comment) {
    throw new AppError('Comment not found.', 404);
  }

  if (comment.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only edit your own comments.', 403);
  }

  comment.body = body;
  await comment.save();

  return comment.toJSON();
}

/**
 * Delete a comment. Only the owner or an admin can delete.
 */
async function deleteComment(commentId, userId, userRole) {
  const comment = await Comment.findByPk(commentId);

  if (!comment) {
    throw new AppError('Comment not found.', 404);
  }

  if (comment.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only delete your own comments.', 403);
  }

  await comment.destroy();

  return { message: 'Comment deleted.' };
}

module.exports = {
  createPost,
  listPosts,
  getPostById,
  updatePost,
  deletePost,
  addComment,
  updateComment,
  deleteComment,
  AppError,
};
