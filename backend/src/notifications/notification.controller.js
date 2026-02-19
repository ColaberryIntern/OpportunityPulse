const notificationService = require('./notification.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

async function getNotifications(req, res) {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await notificationService.getNotifications(req.user.userId, { page, limit, unreadOnly });
    return successResponse(res, result, 'Notifications retrieved successfully.');
  } catch (error) {
    logger.error('Failed to get notifications', { userId: req.user.userId, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function getUnreadCount(req, res) {
  try {
    const result = await notificationService.getUnreadCount(req.user.userId);
    return successResponse(res, result, 'Unread count retrieved successfully.');
  } catch (error) {
    logger.error('Failed to get unread count', { userId: req.user.userId, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function markAsRead(req, res) {
  try {
    const notification = await notificationService.markAsRead(req.user.userId, parseInt(req.params.id, 10));
    return successResponse(res, notification, 'Notification marked as read.');
  } catch (error) {
    logger.error('Failed to mark notification as read', { userId: req.user.userId, notificationId: req.params.id, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function markAllAsRead(req, res) {
  try {
    const result = await notificationService.markAllAsRead(req.user.userId);
    return successResponse(res, result, 'All notifications marked as read.');
  } catch (error) {
    logger.error('Failed to mark all notifications as read', { userId: req.user.userId, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
