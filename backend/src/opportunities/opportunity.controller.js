const opportunityService = require('./opportunity.service');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const { logAuditEvent } = require('../logging/audit.service');

async function listOpportunities(req, res, next) {
  try {
    const {
      type, category, status, tags, q,
      dateFrom, dateTo, minScore, sort, page, limit, actionType,
    } = req.query;

    const result = await opportunityService.listOpportunities({
      type, category, status, tags, q,
      dateFrom, dateTo, minScore, sort, page, limit, actionType,
    });

    logAuditEvent({
      userId: req.user.userId,
      action: 'opportunity_list',
      resource: 'opportunity',
      resourceId: null,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return paginatedResponse(
      res,
      { results: result.results, filters: result.filters },
      result.pagination,
      'Opportunities retrieved.'
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
    const opportunity = await opportunityService.getOpportunityById(req.params.id);

    logAuditEvent({
      userId: req.user.userId,
      action: 'opportunity_view',
      resource: 'opportunity',
      resourceId: req.params.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

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
    const stats = await opportunityService.getOpportunityStats();

    return successResponse(res, { stats }, 'Opportunity statistics retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  listOpportunities,
  getOpportunity,
  getStats,
};
