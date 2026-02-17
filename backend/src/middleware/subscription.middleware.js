const { Op } = require('sequelize');
const { Subscription } = require('../models');
const { errorResponse } = require('../utils/apiResponse');

/**
 * Subscription enforcement middleware.
 * Checks that the authenticated user has an active subscription matching the required plan.
 * Admin users bypass all subscription checks.
 *
 * @param {string} requiredPlan - The minimum plan required (e.g., 'premium').
 */
function checkSubscription(requiredPlan) {
  return async (req, res, next) => {
    try {
      // Admin bypass
      if (req.user && req.user.role === 'admin') {
        return next();
      }

      if (!req.user || !req.user.userId) {
        return errorResponse(res, 'Access denied. Authentication required.', 401);
      }

      // Find the user's most recent subscription
      const subscription = await Subscription.findOne({
        where: { userId: req.user.userId },
        order: [['created_at', 'DESC']],
      });

      if (!subscription) {
        return errorResponse(
          res,
          'Premium subscription required. Upgrade to access this feature.',
          403,
          [{ upgradeRequired: true }]
        );
      }

      // Check if subscription is expired
      if (subscription.endDate && new Date(subscription.endDate) < new Date()) {
        return errorResponse(
          res,
          'Your subscription has expired. Please renew to access this feature.',
          403,
          [{ upgradeRequired: true, expired: true }]
        );
      }

      // Check if plan matches
      if (requiredPlan === 'premium' && subscription.planType !== 'premium') {
        return errorResponse(
          res,
          'Premium subscription required. Upgrade to access this feature.',
          403,
          [{ upgradeRequired: true, currentPlan: subscription.planType }]
        );
      }

      // Attach subscription info to request for downstream use
      req.subscription = subscription;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Premium query parameter gate.
 * Blocks free-tier users from using premium-only query parameters.
 * Admin users bypass this check.
 *
 * @param {...string} paramNames - Query parameter names that require premium.
 */
function checkPremiumQuery(...paramNames) {
  return async (req, res, next) => {
    try {
      // Check if any premium params are being used
      const usedPremiumParams = paramNames.filter(
        (param) => req.query[param] !== undefined && req.query[param] !== '' && req.query[param] !== null
      );

      if (usedPremiumParams.length === 0) {
        return next();
      }

      // Admin bypass
      if (req.user && req.user.role === 'admin') {
        return next();
      }

      if (!req.user || !req.user.userId) {
        return errorResponse(res, 'Access denied. Authentication required.', 401);
      }

      // Find the user's most recent subscription
      const subscription = await Subscription.findOne({
        where: { userId: req.user.userId },
        order: [['created_at', 'DESC']],
      });

      const isExpired = subscription?.endDate && new Date(subscription.endDate) < new Date();
      const isPremium = subscription && subscription.planType === 'premium' && !isExpired;

      if (!isPremium) {
        return errorResponse(
          res,
          `Premium subscription required to use filter: ${usedPremiumParams.join(', ')}.`,
          403,
          [{ upgradeRequired: true, premiumParams: usedPremiumParams }]
        );
      }

      req.subscription = subscription;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { checkSubscription, checkPremiumQuery };
