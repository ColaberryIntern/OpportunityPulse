const subscriptionService = require('./subscription.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

async function getCurrentSubscription(req, res, next) {
  try {
    const subscription = await subscriptionService.getCurrentSubscription(req.user.userId);
    return successResponse(res, { subscription }, 'Current subscription retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function upgrade(req, res, next) {
  try {
    const subscription = await subscriptionService.upgradeToPremium(req.user.userId);
    return successResponse(res, { subscription }, 'Successfully upgraded to Premium.', 201);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function downgrade(req, res, next) {
  try {
    const subscription = await subscriptionService.downgradeToFree(req.user.userId);
    return successResponse(res, { subscription }, 'Successfully downgraded to Free plan.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function getHistory(req, res, next) {
  try {
    const history = await subscriptionService.getSubscriptionHistory(req.user.userId);
    return successResponse(res, { history }, 'Subscription history retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  getCurrentSubscription,
  upgrade,
  downgrade,
  getHistory,
};
