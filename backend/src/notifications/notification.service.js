const { Notification, User } = require('../models');
const { PAGINATION } = require('../config/constants');

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Create a notification record.
 */
async function createNotification({ userId, type, title, message, metadata }) {
  const notification = await Notification.create({
    userId,
    type,
    title,
    message: message || null,
    metadata: metadata || {},
  });

  return notification;
}

/**
 * Paginated notifications for a user, ordered by created_at DESC.
 * If unreadOnly is true, filter where read = false.
 */
async function getNotifications(userId, { page, limit, unreadOnly }) {
  const p = parseInt(page, 10) || PAGINATION.DEFAULT_PAGE;
  const l = Math.min(parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const offset = (p - 1) * l;

  const where = { userId };
  if (unreadOnly === 'true' || unreadOnly === true) {
    where.read = false;
  }

  const { count: total, rows: notifications } = await Notification.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: l,
    offset,
  });

  return {
    notifications,
    pagination: {
      total,
      page: p,
      limit: l,
      pages: Math.ceil(total / l),
    },
  };
}

/**
 * Mark a single notification as read. Verify ownership.
 */
async function markAsRead(userId, notificationId) {
  const notification = await Notification.findByPk(notificationId);

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  if (notification.userId !== userId) {
    throw new AppError('Forbidden: notification does not belong to this user', 403);
  }

  notification.read = true;
  await notification.save();

  return notification;
}

/**
 * Mark all unread notifications as read for a user.
 */
async function markAllAsRead(userId) {
  const [updatedCount] = await Notification.update(
    { read: true },
    { where: { userId, read: false } }
  );

  return { updatedCount };
}

/**
 * Count unread notifications for a user.
 */
async function getUnreadCount(userId) {
  const count = await Notification.count({
    where: { userId, read: false },
  });

  return { count };
}

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
