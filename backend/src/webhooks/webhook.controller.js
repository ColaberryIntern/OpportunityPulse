const webhookService = require('./webhook.service');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');

/**
 * List all webhooks for the authenticated user.
 * GET /
 */
async function listWebhooks(req, res, next) {
  try {
    const webhooks = await webhookService.listWebhooks(req.user.userId);
    return successResponse(res, { webhooks }, 'Webhooks retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Create a new webhook.
 * POST /
 */
async function createWebhook(req, res, next) {
  try {
    const { url, eventTypes, description } = req.body;
    const result = await webhookService.createWebhook(req.user.userId, {
      url,
      eventTypes,
      description,
    });
    return successResponse(
      res,
      result,
      'Webhook created. Store the secret securely — it will not be shown again.',
      201
    );
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Update a webhook.
 * PUT /:id
 */
async function updateWebhook(req, res, next) {
  try {
    const { url, eventTypes, description, isActive } = req.body;
    const result = await webhookService.updateWebhook(
      parseInt(req.params.id, 10),
      req.user.userId,
      { url, eventTypes, description, isActive }
    );
    return successResponse(res, { webhook: result }, 'Webhook updated.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Delete a webhook.
 * DELETE /:id
 */
async function deleteWebhook(req, res, next) {
  try {
    const result = await webhookService.deleteWebhook(
      parseInt(req.params.id, 10),
      req.user.userId
    );
    return successResponse(res, result, 'Webhook deleted.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Test a webhook delivery.
 * POST /:id/test
 */
async function testWebhook(req, res, next) {
  try {
    const result = await webhookService.testWebhook(
      parseInt(req.params.id, 10),
      req.user.userId
    );
    return successResponse(res, result, 'Test delivery sent.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Get delivery log for a webhook.
 * GET /:id/deliveries
 */
async function getDeliveryLog(req, res, next) {
  try {
    const { deliveries, pagination } = await webhookService.getDeliveryLog(
      parseInt(req.params.id, 10),
      req.user.userId,
      req.query
    );
    return paginatedResponse(res, { deliveries }, pagination, 'Delivery log retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getDeliveryLog,
};
