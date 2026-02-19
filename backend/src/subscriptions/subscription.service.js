const { Subscription } = require('../models');
const logger = require('../logging/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Get the user's current (most recent) subscription.
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function getCurrentSubscription(userId) {
  const subscription = await Subscription.findOne({
    where: { userId },
    order: [['created_at', 'DESC']],
  });
  return subscription;
}

/**
 * Upgrade a user to the premium plan.
 * Creates a new subscription record with planType='premium', valid for 1 year.
 * Throws if the user already has an active premium subscription.
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function upgradeToPremium(userId) {
  // Check for existing active premium subscription
  const current = await getCurrentSubscription(userId);

  if (current && current.planType === 'premium') {
    const isExpired = current.endDate && new Date(current.endDate) < new Date();
    if (!isExpired) {
      throw new AppError('You already have an active premium subscription.', 409);
    }
  }

  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const subscription = await Subscription.create({
    userId,
    planType: 'premium',
    startDate: now,
    endDate: oneYearFromNow,
  });

  logger.info(`User ${userId} upgraded to premium.`);
  return subscription;
}

/**
 * Downgrade a user to the free plan.
 * Creates a new subscription record with planType='free' and no end date.
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function downgradeToFree(userId) {
  const subscription = await Subscription.create({
    userId,
    planType: 'free',
    startDate: new Date(),
    endDate: null,
  });

  logger.info(`User ${userId} downgraded to free plan.`);
  return subscription;
}

/**
 * Get full subscription history for a user.
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
async function getSubscriptionHistory(userId) {
  const history = await Subscription.findAll({
    where: { userId },
    order: [['created_at', 'DESC']],
  });
  return history;
}

module.exports = {
  getCurrentSubscription,
  upgradeToPremium,
  downgradeToFree,
  getSubscriptionHistory,
};
