const apiKeyService = require('./apiKey.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

/**
 * List all API keys for the authenticated user.
 * GET /
 */
async function listApiKeys(req, res, next) {
  try {
    const keys = await apiKeyService.listApiKeys(req.user.userId);
    return successResponse(res, { apiKeys: keys }, 'API keys retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Create a new API key.
 * POST /
 */
async function createApiKey(req, res, next) {
  try {
    const { name, scopes } = req.body;
    const result = await apiKeyService.createApiKey(req.user.userId, { name, scopes });
    return successResponse(res, result, 'API key created. Store the key securely — it will not be shown again.', 201);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Update an API key (name and/or scopes).
 * PATCH /:id
 */
async function updateApiKey(req, res, next) {
  try {
    const { name, scopes } = req.body;
    const result = await apiKeyService.updateApiKey(
      parseInt(req.params.id, 10),
      req.user.userId,
      { name, scopes }
    );
    return successResponse(res, { apiKey: result }, 'API key updated.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Revoke an API key.
 * DELETE /:id
 */
async function revokeApiKey(req, res, next) {
  try {
    const result = await apiKeyService.revokeApiKey(
      parseInt(req.params.id, 10),
      req.user.userId
    );
    return successResponse(res, { apiKey: result }, 'API key revoked.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  listApiKeys,
  createApiKey,
  updateApiKey,
  revokeApiKey,
};
