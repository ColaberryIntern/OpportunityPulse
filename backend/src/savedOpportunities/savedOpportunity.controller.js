const savedOpportunityService = require('./savedOpportunity.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

async function save(req, res, next) {
  try {
    const { opportunityId } = req.body;
    if (!opportunityId) {
      return errorResponse(res, 'opportunityId is required.', 400);
    }
    const saved = await savedOpportunityService.saveOpportunity(req.user.userId, opportunityId);
    return successResponse(res, { saved }, 'Opportunity saved.', 201);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function unsave(req, res, next) {
  try {
    const { opportunityId } = req.params;
    const deleted = await savedOpportunityService.unsaveOpportunity(req.user.userId, parseInt(opportunityId, 10));
    if (!deleted) {
      return errorResponse(res, 'Saved opportunity not found.', 404);
    }
    return successResponse(res, null, 'Opportunity unsaved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function list(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await savedOpportunityService.getSavedOpportunities(req.user.userId, { page, limit });
    return successResponse(res, result, 'Saved opportunities retrieved.');
  } catch (error) {
    next(error);
  }
}

async function checkSaved(req, res, next) {
  try {
    const { opportunityId } = req.params;
    const saved = await savedOpportunityService.isOpportunitySaved(req.user.userId, parseInt(opportunityId, 10));
    return successResponse(res, { saved }, 'Save status retrieved.');
  } catch (error) {
    next(error);
  }
}

async function batchCheckSaved(req, res, next) {
  try {
    const { opportunityIds } = req.body;
    if (!Array.isArray(opportunityIds) || opportunityIds.length === 0) {
      return errorResponse(res, 'opportunityIds array is required.', 400);
    }
    // Limit to 50 IDs per request
    const ids = opportunityIds.slice(0, 50).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    const savedMap = await savedOpportunityService.batchCheckSaved(req.user.userId, ids);
    return successResponse(res, { savedMap }, 'Batch save status retrieved.');
  } catch (error) {
    next(error);
  }
}

module.exports = { save, unsave, list, checkSaved, batchCheckSaved };
