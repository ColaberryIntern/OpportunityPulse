const { Feedback, User, Sequelize } = require('../models');
const { PAGINATION, ROLES } = require('../config/constants');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Create a new feedback record.
 */
async function createFeedback(userId, { score, comments, type, targetId }) {
  const feedback = await Feedback.create({
    score,
    comments: comments || null,
    type: type || 'platform',
    targetId: targetId || null,
    userId,
  });

  const full = await Feedback.findByPk(feedback.id, {
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
  });

  return full.toJSON();
}

/**
 * List feedback with optional filters and pagination.
 */
async function listFeedback({ page, limit, type, status } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const offset = (safePage - 1) * safeLimit;

  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;

  const { rows: feedback, count: total } = await Feedback.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    feedback,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Get a single feedback record by ID.
 */
async function getFeedbackById(id) {
  const feedback = await Feedback.findByPk(id, {
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
  });

  if (!feedback) {
    throw new AppError('Feedback not found.', 404);
  }

  return feedback;
}

/**
 * Update a feedback record. Only the owner or an admin can update.
 */
async function updateFeedback(id, userId, userRole, { score, comments, status }) {
  const feedback = await Feedback.findByPk(id);

  if (!feedback) {
    throw new AppError('Feedback not found.', 404);
  }

  // Ownership check: only owner or admin
  if (feedback.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only edit your own feedback.', 403);
  }

  if (score !== undefined) feedback.score = score;
  if (comments !== undefined) feedback.comments = comments;
  if (status !== undefined) feedback.status = status;

  await feedback.save();

  return feedback.toJSON();
}

/**
 * Delete a feedback record. Only the owner or an admin can delete.
 */
async function deleteFeedback(id, userId, userRole) {
  const feedback = await Feedback.findByPk(id);

  if (!feedback) {
    throw new AppError('Feedback not found.', 404);
  }

  if (feedback.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only delete your own feedback.', 403);
  }

  await feedback.destroy();

  return { message: 'Feedback deleted.' };
}

/**
 * Get aggregate feedback statistics.
 */
async function getFeedbackStats() {
  const totalResult = await Feedback.findAll({
    attributes: [
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalCount'],
      [Sequelize.fn('ROUND', Sequelize.fn('AVG', Sequelize.col('score')), 1), 'averageScore'],
    ],
    raw: true,
  });

  const totalCount = parseInt(totalResult[0].totalCount, 10) || 0;
  const averageScore = totalResult[0].averageScore !== null
    ? parseFloat(totalResult[0].averageScore)
    : null;

  const byType = await Feedback.findAll({
    attributes: [
      'type',
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
    ],
    group: ['type'],
    raw: true,
  });

  const byStatus = await Feedback.findAll({
    attributes: [
      'status',
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
    ],
    group: ['status'],
    raw: true,
  });

  return {
    totalCount,
    averageScore,
    byType: byType.map((row) => ({ type: row.type, count: parseInt(row.count, 10) })),
    byStatus: byStatus.map((row) => ({ status: row.status, count: parseInt(row.count, 10) })),
  };
}

module.exports = {
  createFeedback,
  listFeedback,
  getFeedbackById,
  updateFeedback,
  deleteFeedback,
  getFeedbackStats,
  AppError,
};
