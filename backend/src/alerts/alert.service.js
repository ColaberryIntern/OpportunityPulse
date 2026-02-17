const { Op } = require('sequelize');
const { Alert, Opportunity } = require('../models');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const logger = require('../logging/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * List alerts for a user with pagination and optional filters.
 */
async function listAlerts(userId, { page, limit, type, severity, unreadOnly } = {}) {
  const { page: safePage, limit: safeLimit, offset } = parsePagination({ page, limit });

  const where = { userId };
  if (type) where.type = type;
  if (severity) where.severity = severity;
  if (unreadOnly) where.read = false;

  const { rows: alerts, count: total } = await Alert.findAndCountAll({
    where,
    include: [{ model: Opportunity, as: 'opportunity', attributes: ['id', 'title', 'type'], required: false }],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    alerts,
    pagination: buildPaginationMeta(total, safePage, safeLimit),
  };
}

/**
 * Get unread alert count for a user.
 */
async function getUnreadCount(userId) {
  const count = await Alert.count({ where: { userId, read: false } });
  return { unreadCount: count };
}

/**
 * Mark a single alert as read. User can only mark their own alerts.
 */
async function markAsRead(alertId, userId) {
  const alert = await Alert.findOne({ where: { id: alertId, userId } });
  if (!alert) {
    throw new AppError('Alert not found.', 404);
  }

  alert.read = true;
  await alert.save();
  return alert;
}

/**
 * Mark all alerts as read for a user.
 */
async function markAllAsRead(userId) {
  const [updatedCount] = await Alert.update(
    { read: true },
    { where: { userId, read: false } }
  );

  return { updatedCount };
}

/**
 * Delete an alert. User can only delete their own alerts.
 */
async function deleteAlert(alertId, userId) {
  const alert = await Alert.findOne({ where: { id: alertId, userId } });
  if (!alert) {
    throw new AppError('Alert not found.', 404);
  }

  await alert.destroy();
  return { deleted: true };
}

/**
 * Create an alert (system use — not exposed via user-facing API).
 */
async function createAlert({ userId, type, title, message, opportunityId, severity, metadata }) {
  const alert = await Alert.create({
    userId,
    type,
    title,
    message,
    opportunityId: opportunityId || null,
    severity: severity || 'info',
    metadata: metadata || {},
  });

  return alert;
}

/**
 * Create alerts in bulk (system use — for batch notifications).
 */
async function createAlertsBulk(alertRecords) {
  const alerts = await Alert.bulkCreate(alertRecords);
  logger.info(`Bulk created ${alerts.length} alerts`);
  return alerts;
}

module.exports = {
  listAlerts,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteAlert,
  createAlert,
  createAlertsBulk,
  AppError,
};
