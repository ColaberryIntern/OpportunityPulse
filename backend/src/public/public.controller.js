const publicService = require('./public.service');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');

async function listOpportunities(req, res, next) {
  try {
    const { type, category, page, limit } = req.query;
    const result = await publicService.listPublicOpportunities({ type, category, page, limit });

    return paginatedResponse(
      res,
      result.opportunities,
      result.pagination,
      'Public opportunities retrieved.'
    );
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function getOpportunity(req, res, next) {
  try {
    const opportunity = await publicService.getPublicOpportunity(req.params.id);
    return successResponse(res, { opportunity }, 'Opportunity retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function getStats(req, res, next) {
  try {
    const stats = await publicService.getPublicStats();
    return successResponse(res, { stats }, 'Public opportunity statistics retrieved.');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listOpportunities,
  getOpportunity,
  getStats,
};
