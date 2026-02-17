const forumService = require('./forum.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { logAuditEvent } = require('../logging/audit.service');

async function createPost(req, res, next) {
  try {
    const { title, body, category } = req.body;
    const post = await forumService.createPost(req.user.userId, {
      title, body, category,
    });

    logAuditEvent({
      userId: req.user.userId,
      action: 'forum_post_create',
      resource: 'forum_post',
      resourceId: post.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { post }, 'Forum post created.', 201);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function listPosts(req, res, next) {
  try {
    const { page, limit, category, status } = req.query;
    const result = await forumService.listPosts({ page, limit, category, status });
    return successResponse(res, result, 'Forum posts retrieved.');
  } catch (error) {
    next(error);
  }
}

async function getPost(req, res, next) {
  try {
    const post = await forumService.getPostById(req.params.id);
    return successResponse(res, { post }, 'Forum post retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function updatePost(req, res, next) {
  try {
    const { title, body, category, status } = req.body;
    const post = await forumService.updatePost(
      req.params.id,
      req.user.userId,
      req.user.role,
      { title, body, category, status }
    );

    logAuditEvent({
      userId: req.user.userId,
      action: 'forum_post_update',
      resource: 'forum_post',
      resourceId: req.params.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { post }, 'Forum post updated.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function deletePost(req, res, next) {
  try {
    const result = await forumService.deletePost(
      req.params.id,
      req.user.userId,
      req.user.role
    );

    logAuditEvent({
      userId: req.user.userId,
      action: 'forum_post_delete',
      resource: 'forum_post',
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

async function addComment(req, res, next) {
  try {
    const { body } = req.body;
    const comment = await forumService.addComment(req.params.id, req.user.userId, { body });

    logAuditEvent({
      userId: req.user.userId,
      action: 'forum_comment_create',
      resource: 'comment',
      resourceId: comment.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { comment }, 'Comment added.', 201);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function updateComment(req, res, next) {
  try {
    const comment = await forumService.updateComment(
      req.params.commentId,
      req.user.userId,
      req.user.role,
      { body: req.body.body }
    );

    logAuditEvent({
      userId: req.user.userId,
      action: 'forum_comment_update',
      resource: 'comment',
      resourceId: req.params.commentId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { comment }, 'Comment updated.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

async function deleteComment(req, res, next) {
  try {
    const result = await forumService.deleteComment(
      req.params.commentId,
      req.user.userId,
      req.user.role
    );

    logAuditEvent({
      userId: req.user.userId,
      action: 'forum_comment_delete',
      resource: 'comment',
      resourceId: req.params.commentId,
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

module.exports = {
  createPost,
  listPosts,
  getPost,
  updatePost,
  deletePost,
  addComment,
  updateComment,
  deleteComment,
};
