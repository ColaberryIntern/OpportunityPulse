const { Op } = require('sequelize');
const {
  User,
  UserRole,
  Subscription,
  UserActivity,
  Opportunity,
  AnalysisRun,
  IngestionLog,
  Content,
} = require('../models');
const { PAGINATION } = require('../config/constants');

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Paginated user list with role info.
 * If search provided, filter by email or name (iLike).
 */
async function listUsers({ page, limit, search }) {
  const p = parseInt(page, 10) || PAGINATION.DEFAULT_PAGE;
  const l = Math.min(parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const offset = (p - 1) * l;

  const where = {};
  if (search) {
    where[Op.or] = [
      { email: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { count: total, rows: users } = await User.findAndCountAll({
    where,
    include: [{ model: UserRole, as: 'role', attributes: ['id', 'roleName', 'description'] }],
    attributes: { exclude: ['passwordHash', 'verificationToken', 'resetToken', 'resetTokenExpiry'] },
    order: [['id', 'ASC']],
    limit: l,
    offset,
  });

  return {
    users,
    pagination: {
      total,
      page: p,
      limit: l,
      pages: Math.ceil(total / l),
    },
  };
}

/**
 * Single user with role + subscription info.
 */
async function getUserById(userId) {
  const user = await User.findByPk(userId, {
    include: [
      { model: UserRole, as: 'role', attributes: ['id', 'roleName', 'description'] },
      { model: Subscription, as: 'subscriptions', order: [['createdAt', 'DESC']], limit: 1 },
    ],
    attributes: { exclude: ['passwordHash', 'verificationToken', 'resetToken', 'resetTokenExpiry'] },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
}

/**
 * Update user's roleId. Verify role exists.
 */
async function updateUserRole(userId, roleId) {
  const role = await UserRole.findByPk(roleId);
  if (!role) {
    throw new AppError('Role not found', 404);
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  user.roleId = roleId;
  await user.save();

  const updated = await User.findByPk(userId, {
    include: [{ model: UserRole, as: 'role', attributes: ['id', 'roleName', 'description'] }],
    attributes: { exclude: ['passwordHash', 'verificationToken', 'resetToken', 'resetTokenExpiry'] },
  });

  return updated;
}

/**
 * Create a new Subscription record for the user.
 * planType must be 'free' or 'premium'.
 */
async function updateUserSubscription(userId, planType) {
  if (!['free', 'premium'].includes(planType)) {
    throw new AppError('planType must be "free" or "premium"', 400);
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const subscription = await Subscription.create({
    userId,
    planType,
    startDate: new Date(),
  });

  return subscription;
}

/**
 * Paginated UserActivity list ordered by created_at DESC.
 * Includes User association (email, name only).
 */
async function getAuditLog({ page, limit }) {
  const p = parseInt(page, 10) || PAGINATION.DEFAULT_PAGE;
  const l = Math.min(parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const offset = (p - 1) * l;

  const { count: total, rows: activities } = await UserActivity.findAndCountAll({
    include: [{ model: User, as: 'user', attributes: ['email', 'name'] }],
    order: [['created_at', 'DESC']],
    limit: l,
    offset,
  });

  return {
    activities,
    pagination: {
      total,
      page: p,
      limit: l,
      pages: Math.ceil(total / l),
    },
  };
}

/**
 * System statistics: counts and recent records.
 */
async function getSystemStats() {
  const [totalUsers, activeOpportunities, totalContent, recentIngestionLogs, recentAnalysisRuns] =
    await Promise.all([
      User.count(),
      Opportunity.count({ where: { status: 'active' } }),
      Content.count(),
      IngestionLog.findAll({ order: [['created_at', 'DESC']], limit: 5 }),
      AnalysisRun.findAll({ order: [['started_at', 'DESC']], limit: 5 }),
    ]);

  return {
    totalUsers,
    activeOpportunities,
    totalContent,
    recentIngestionLogs,
    recentAnalysisRuns,
  };
}

module.exports = {
  listUsers,
  getUserById,
  updateUserRole,
  updateUserSubscription,
  getAuditLog,
  getSystemStats,
};
