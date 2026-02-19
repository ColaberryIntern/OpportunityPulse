const { SavedOpportunity, Opportunity, DataSource } = require('../models');
const { PAGINATION } = require('../config/constants');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Save an opportunity for a user.
 * Handles unique constraint violation gracefully — returns existing if already saved.
 */
async function saveOpportunity(userId, opportunityId) {
  // Verify the opportunity exists
  const opportunity = await Opportunity.findByPk(opportunityId);
  if (!opportunity) {
    throw new AppError('Opportunity not found.', 404);
  }

  try {
    const saved = await SavedOpportunity.create({ userId, opportunityId });
    return saved.toJSON();
  } catch (error) {
    // Handle unique constraint violation — already saved
    if (error.name === 'SequelizeUniqueConstraintError') {
      const existing = await SavedOpportunity.findOne({
        where: { userId, opportunityId },
      });
      return existing.toJSON();
    }
    throw error;
  }
}

/**
 * Unsave (remove) a saved opportunity for a user.
 * Returns true if deleted, false if not found.
 */
async function unsaveOpportunity(userId, opportunityId) {
  const deleted = await SavedOpportunity.destroy({
    where: { userId, opportunityId },
  });
  return deleted > 0;
}

/**
 * Get paginated list of saved opportunities for a user,
 * including full Opportunity details.
 */
async function getSavedOpportunities(userId, { page, limit } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const offset = (safePage - 1) * safeLimit;

  const { rows: savedOpportunities, count: total } = await SavedOpportunity.findAndCountAll({
    where: { userId },
    include: [
      {
        model: Opportunity,
        as: 'opportunity',
        include: [
          { model: DataSource, as: 'dataSource', attributes: ['id', 'name', 'type'] },
        ],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    savedOpportunities,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Check if an opportunity is saved by a user.
 * Returns boolean.
 */
async function isOpportunitySaved(userId, opportunityId) {
  const count = await SavedOpportunity.count({
    where: { userId, opportunityId },
  });
  return count > 0;
}

/**
 * Batch check which opportunities are saved by a user.
 * Returns an object mapping opportunityId → boolean.
 */
async function batchCheckSaved(userId, opportunityIds) {
  const saved = await SavedOpportunity.findAll({
    where: { userId, opportunityId: opportunityIds },
    attributes: ['opportunityId'],
    raw: true,
  });
  const savedSet = new Set(saved.map(s => s.opportunityId));
  const result = {};
  for (const id of opportunityIds) {
    result[id] = savedSet.has(id);
  }
  return result;
}

module.exports = {
  saveOpportunity,
  unsaveOpportunity,
  getSavedOpportunities,
  isOpportunitySaved,
  batchCheckSaved,
  AppError,
};
