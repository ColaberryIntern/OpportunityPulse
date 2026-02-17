const feedbackService = require('./feedback.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { logAuditEvent } = require('../logging/audit.service');

async function createFeedback(req, res, next) {
  try {
    const { score, comments, type, targetId } = req.body;
    const feedback = await feedbackService.createFeedback(req.user.userId, {
      score, comments, type, targetId,
    });

    logAuditEvent({
      userId: req.user.userId,
      action: 'feedback_create',
      resource: 'feedback',
      resourceId: feedback.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { feedback }, 'Feedback created.', 201);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function listFeedback(req, res, next) {
  try {
    const { page, limit, type, status } = req.query;
    const result = await feedbackService.listFeedback({ page, limit, type, status });
    return successResponse(res, result, 'Feedback retrieved.');
  } catch (error) {
    next(error);
  }
}

async function getFeedback(req, res, next) {
  try {
    const feedback = await feedbackService.getFeedbackById(req.params.id);
    return successResponse(res, { feedback }, 'Feedback retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function updateFeedback(req, res, next) {
  try {
    const { score, comments, status } = req.body;
    const feedback = await feedbackService.updateFeedback(
      req.params.id,
      req.user.userId,
      req.user.role,
      { score, comments, status }
    );

    logAuditEvent({
      userId: req.user.userId,
      action: 'feedback_update',
      resource: 'feedback',
      resourceId: req.params.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { feedback }, 'Feedback updated.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function deleteFeedback(req, res, next) {
  try {
    const result = await feedbackService.deleteFeedback(
      req.params.id,
      req.user.userId,
      req.user.role
    );

    logAuditEvent({
      userId: req.user.userId,
      action: 'feedback_delete',
      resource: 'feedback',
      resourceId: req.params.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, null, result.message);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function getFeedbackStats(req, res, next) {
  try {
    const stats = await feedbackService.getFeedbackStats();
    return successResponse(res, { stats }, 'Feedback stats retrieved.');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createFeedback,
  listFeedback,
  getFeedback,
  updateFeedback,
  deleteFeedback,
  getFeedbackStats,
};
