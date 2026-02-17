const roleService = require('./role.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { logAuditEvent } = require('../logging/audit.service');

async function listRoles(req, res, next) {
  try {
    const roles = await roleService.listRoles();
    return successResponse(res, { roles }, 'Roles retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function assignRole(req, res, next) {
  try {
    const { userId, roleId } = req.body;
    const user = await roleService.assignRole({ userId, roleId });

    logAuditEvent({
      userId: req.user.userId,
      action: 'role_assigned',
      resource: 'users',
      resourceId: userId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { targetUserId: userId, newRoleId: roleId },
    });

    return successResponse(res, { user }, 'Role assigned successfully.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function updateRole(req, res, next) {
  try {
    const { id } = req.params;
    const { description } = req.body;
    const role = await roleService.updateRole(id, { description });

    logAuditEvent({
      userId: req.user.userId,
      action: 'role_updated',
      resource: 'user_roles',
      resourceId: id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { role }, 'Role updated successfully.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  listRoles,
  assignRole,
  updateRole,
};
