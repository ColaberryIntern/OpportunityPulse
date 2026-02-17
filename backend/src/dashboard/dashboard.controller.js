const dashboardService = require('./dashboard.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

async function getStats(req, res, next) {
  try {
    const stats = await dashboardService.getStats(req.user.userId);
    return successResponse(res, { stats }, 'Dashboard stats retrieved.');
  } catch (error) {
    next(error);
  }
}

async function getActivity(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await dashboardService.getActivity(req.user.userId, { page, limit });
    return successResponse(res, result, 'Activity retrieved.');
  } catch (error) {
    next(error);
  }
}

async function getOpportunityStats(req, res, next) {
  try {
    const stats = await dashboardService.getOpportunityStats();
    return successResponse(res, { stats }, 'Opportunity stats retrieved.');
  } catch (error) {
    next(error);
  }
}

async function getChartData(req, res, next) {
  try {
    const { type, period } = req.query;
    const chartData = await dashboardService.getChartData(type, period);
    return successResponse(res, { chartData }, 'Chart data retrieved.');
  } catch (error) {
    next(error);
  }
}

async function getTrendSummary(req, res, next) {
  try {
    const trends = await dashboardService.getTrendSummary();
    return successResponse(res, { trends }, 'Trend summary retrieved.');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStats,
  getActivity,
  getOpportunityStats,
  getChartData,
  getTrendSummary,
};
