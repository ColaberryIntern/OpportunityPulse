const adminService = require('./admin.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

async function listUsers(req, res) {
  try {
    const { page, limit, search } = req.query;
    const result = await adminService.listUsers({ page, limit, search });
    return successResponse(res, result, 'Users retrieved successfully.');
  } catch (error) {
    logger.error('Failed to list users', { error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function getUserById(req, res) {
  try {
    const user = await adminService.getUserById(req.params.id);
    return successResponse(res, user, 'User retrieved successfully.');
  } catch (error) {
    logger.error('Failed to get user', { userId: req.params.id, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function updateUserRole(req, res) {
  try {
    const { roleId } = req.body;
    if (!roleId) {
      return errorResponse(res, 'roleId is required', 400);
    }
    const user = await adminService.updateUserRole(req.params.id, roleId);
    return successResponse(res, user, 'User role updated successfully.');
  } catch (error) {
    logger.error('Failed to update user role', { userId: req.params.id, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function updateUserSubscription(req, res) {
  try {
    const { planType } = req.body;
    if (!planType) {
      return errorResponse(res, 'planType is required', 400);
    }
    const subscription = await adminService.updateUserSubscription(req.params.id, planType);
    return successResponse(res, subscription, 'User subscription updated successfully.', 201);
  } catch (error) {
    logger.error('Failed to update user subscription', { userId: req.params.id, error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function getAuditLog(req, res) {
  try {
    const { page, limit } = req.query;
    const result = await adminService.getAuditLog({ page, limit });
    return successResponse(res, result, 'Audit log retrieved successfully.');
  } catch (error) {
    logger.error('Failed to get audit log', { error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

async function getSystemStats(req, res) {
  try {
    const stats = await adminService.getSystemStats();
    return successResponse(res, stats, 'System stats retrieved successfully.');
  } catch (error) {
    logger.error('Failed to get system stats', { error: error.message });
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

module.exports = {
  listUsers,
  getUserById,
  updateUserRole,
  updateUserSubscription,
  getAuditLog,
  getSystemStats,
};
