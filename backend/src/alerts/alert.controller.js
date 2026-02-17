const alertService = require('./alert.service');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');

/**
 * List alerts for the authenticated user.
 * GET /
 */
async function listAlerts(req, res, next) {
  try {
    const { type, severity, unreadOnly, page, limit } = req.query;
    const result = await alertService.listAlerts(req.user.userId, {
      page, limit, type, severity, unreadOnly: unreadOnly === 'true',
    });

    return paginatedResponse(res, result.alerts, result.pagination, 'Alerts retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Get unread alert count.
 * GET /unread
 */
async function getUnreadCount(req, res, next) {
  try {
    const result = await alertService.getUnreadCount(req.user.userId);
    return successResponse(res, result, 'Unread count retrieved.');
  } catch (error) {
    next(error);
  }
}

/**
 * Mark a single alert as read.
 * PUT /:id/read
 */
async function markAsRead(req, res, next) {
  try {
    const alert = await alertService.markAsRead(parseInt(req.params.id, 10), req.user.userId);
    return successResponse(res, { alert }, 'Alert marked as read.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Mark all alerts as read.
 * PUT /read-all
 */
async function markAllAsRead(req, res, next) {
  try {
    const result = await alertService.markAllAsRead(req.user.userId);
    return successResponse(res, result, 'All alerts marked as read.');
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a single alert.
 * DELETE /:id
 */
async function deleteAlert(req, res, next) {
  try {
    await alertService.deleteAlert(parseInt(req.params.id, 10), req.user.userId);
    return successResponse(res, null, 'Alert deleted.', 200);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  listAlerts,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteAlert,
};
