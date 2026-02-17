const { Content, User } = require('../models');
const { PAGINATION, ROLES } = require('../config/constants');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Create a new content item.
 */
async function createContent(userId, { title, body, category, tags, status }) {
  const content = await Content.create({
    title,
    body,
    category: category || null,
    tags: tags || [],
    status: status || 'draft',
    userId,
  });

  return content.toJSON();
}

/**
 * List content with optional filters and pagination.
 */
async function listContent({ page, limit, status, category } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const offset = (safePage - 1) * safeLimit;

  const where = {};
  if (status) where.status = status;
  if (category) where.category = category;

  const { rows: content, count: total } = await Content.findAndCountAll({
    where,
    include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    content,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Get a single content item by ID.
 */
async function getContentById(id) {
  const content = await Content.findByPk(id, {
    include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
  });

  if (!content) {
    throw new AppError('Content not found.', 404);
  }

  return content;
}

/**
 * Update a content item. Only the owner or an admin can update.
 */
async function updateContent(id, userId, userRole, { title, body, category, tags, status }) {
  const content = await Content.findByPk(id);

  if (!content) {
    throw new AppError('Content not found.', 404);
  }

  // Ownership check: only owner or admin
  if (content.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only edit your own content.', 403);
  }

  if (title !== undefined) content.title = title;
  if (body !== undefined) content.body = body;
  if (category !== undefined) content.category = category;
  if (tags !== undefined) content.tags = tags;
  if (status !== undefined) content.status = status;

  await content.save();

  return content.toJSON();
}

/**
 * Soft delete a content item. Only the owner or an admin can delete.
 */
async function deleteContent(id, userId, userRole) {
  const content = await Content.findByPk(id);

  if (!content) {
    throw new AppError('Content not found.', 404);
  }

  if (content.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only delete your own content.', 403);
  }

  await content.destroy(); // paranoid soft delete

  return { message: 'Content deleted.' };
}

module.exports = {
  createContent,
  listContent,
  getContentById,
  updateContent,
  deleteContent,
  AppError,
};
