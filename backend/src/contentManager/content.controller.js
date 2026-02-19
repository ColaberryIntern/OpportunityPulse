const contentService = require('./content.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { logAuditEvent } = require('../logging/audit.service');

async function createContent(req, res, next) {
  try {
    const { title, body, category, tags, status } = req.body;
    const content = await contentService.createContent(req.user.userId, {
      title, body, category, tags, status,
    });

    logAuditEvent({
      userId: req.user.userId,
      action: 'content_create',
      resource: 'content',
      resourceId: content.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { content }, 'Content created.', 201);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function listContent(req, res, next) {
  try {
    const { page, limit, status, category } = req.query;
    const result = await contentService.listContent({ page, limit, status, category });
    return successResponse(res, result, 'Content retrieved.');
  } catch (error) {
    next(error);
  }
}

async function getContent(req, res, next) {
  try {
    const content = await contentService.getContentById(req.params.id);
    return successResponse(res, { content }, 'Content retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function updateContent(req, res, next) {
  try {
    const { title, body, category, tags, status } = req.body;
    const content = await contentService.updateContent(
      req.params.id,
      req.user.userId,
      req.user.role,
      { title, body, category, tags, status }
    );

    logAuditEvent({
      userId: req.user.userId,
      action: 'content_update',
      resource: 'content',
      resourceId: req.params.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { content }, 'Content updated.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function deleteContent(req, res, next) {
  try {
    const result = await contentService.deleteContent(
      req.params.id,
      req.user.userId,
      req.user.role
    );

    logAuditEvent({
      userId: req.user.userId,
      action: 'content_delete',
      resource: 'content',
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

async function generateContent(req, res) {
  try {
    const { topic } = req.body;
    if (!topic || topic.trim().length < 3) {
      return errorResponse(res, 'Topic must be at least 3 characters.', 400);
    }
    const result = await contentService.generateContent(topic.trim());
    return successResponse(res, result, 'Content generated successfully.', 201);
  } catch (error) {
    return errorResponse(res, error.message, error.statusCode || 500);
  }
}

module.exports = {
  createContent,
  listContent,
  getContent,
  updateContent,
  deleteContent,
  generateContent,
};
