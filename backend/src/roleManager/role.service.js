const { UserRole, User } = require('../models');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * List all available roles.
 */
async function listRoles() {
  return UserRole.findAll();
}

/**
 * Assign a role to a user.
 * Prevents removing the last admin to avoid lockout.
 */
async function assignRole({ userId, roleId }) {
  // Validate role exists
  const role = await UserRole.findByPk(roleId);
  if (!role) {
    throw new AppError('Role not found.', 404);
  }

  // Validate user exists
  const user = await User.findByPk(userId, {
    include: [{ model: UserRole, as: 'role' }],
  });
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  // Check if user is currently an admin being reassigned away from admin
  const currentRole = await UserRole.findOne({ where: { id: user.roleId } });
  if (currentRole && currentRole.roleName === 'admin' && role.roleName !== 'admin') {
    const adminCount = await User.count({ where: { roleId: currentRole.id } });
    if (adminCount <= 1) {
      throw new AppError('Cannot remove the last admin. Assign another admin first.', 400);
    }
  }

  user.roleId = roleId;
  await user.save();
  await user.reload({ include: [{ model: UserRole, as: 'role' }] });

  return user.toSafeJSON();
}

/**
 * Update a role's description. Role names cannot be changed.
 */
async function updateRole(roleId, { description }) {
  const role = await UserRole.findByPk(roleId);
  if (!role) {
    throw new AppError('Role not found.', 404);
  }

  if (description !== undefined) {
    role.description = description;
  }
  // roleName is intentionally NOT updatable

  await role.save();

  return role.toJSON();
}

module.exports = {
  listRoles,
  assignRole,
  updateRole,
  AppError,
};
