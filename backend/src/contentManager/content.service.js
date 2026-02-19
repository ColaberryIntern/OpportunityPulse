const { Content, User } = require('../models');
const { PAGINATION, ROLES } = require('../config/constants');
const { emit, EVENTS } = require('../webhooks/eventBus');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Create a new content item.
 */
async function createContent(userId, { title, body, category, tags, status }) {
  const content = await Content.create({
    title,
    body,
    category: category || null,
    tags: tags || [],
    status: status || 'draft',
    userId,
  });

  return content.toJSON();
}

/**
 * List content with optional filters and pagination.
 */
async function listContent({ page, limit, status, category } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const offset = (safePage - 1) * safeLimit;

  const where = {};
  if (status) where.status = status;
  if (category) where.category = category;

  const { rows: content, count: total } = await Content.findAndCountAll({
    where,
    include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    content,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Get a single content item by ID.
 */
async function getContentById(id) {
  const content = await Content.findByPk(id, {
    include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
  });

  if (!content) {
    throw new AppError('Content not found.', 404);
  }

  return content;
}

/**
 * Update a content item. Only the owner or an admin can update.
 */
async function updateContent(id, userId, userRole, { title, body, category, tags, status }) {
  const content = await Content.findByPk(id);

  if (!content) {
    throw new AppError('Content not found.', 404);
  }

  // Ownership check: only owner or admin
  if (content.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only edit your own content.', 403);
  }

  const previousStatus = content.status;

  if (title !== undefined) content.title = title;
  if (body !== undefined) content.body = body;
  if (category !== undefined) content.category = category;
  if (tags !== undefined) content.tags = tags;
  if (status !== undefined) content.status = status;

  await content.save();

  // Fire webhook event when content transitions to published
  if (status === 'published' && previousStatus !== 'published') {
    emit(EVENTS.CONTENT_PUBLISHED, {
      id: content.id,
      title: content.title,
      category: content.category,
      userId: content.userId,
    });
  }

  return content.toJSON();
}

/**
 * Soft delete a content item. Only the owner or an admin can delete.
 */
async function deleteContent(id, userId, userRole) {
  const content = await Content.findByPk(id);

  if (!content) {
    throw new AppError('Content not found.', 404);
  }

  if (content.userId !== userId && userRole !== ROLES.ADMIN) {
    throw new AppError('Forbidden: you can only delete your own content.', 403);
  }

  await content.destroy(); // paranoid soft delete

  return { message: 'Content deleted.' };
}

/**
 * Generate content using AI based on a topic.
 */
async function generateContent(topic) {
  const { getAIClient } = require('../analysis/ai.client');
  const aiClient = getAIClient();

  const systemPrompt = `You are a professional content writer for a platform focused on government AI contracts, AI job trends, and AI investment opportunities. Generate a well-structured article based on the given topic. Return JSON with:
- title: a compelling article title
- body: the full article text (500-1000 words, well-formatted with paragraphs)
- category: one of "gov_contracts", "ai_jobs", "investments", "industry", "technology"
- tags: array of 3-5 relevant tags`;

  const { content } = await aiClient.chat(systemPrompt, `Write an article about: ${topic}`, {
    temperature: 0.7,
    maxTokens: 2000,
  });

  let generated;
  try {
    generated = JSON.parse(content);
  } catch {
    generated = { title: topic, body: content, category: 'industry', tags: [] };
  }

  return {
    title: generated.title || topic,
    body: generated.body || '',
    category: generated.category || 'industry',
    tags: Array.isArray(generated.tags) ? generated.tags : [],
  };
}

module.exports = {
  createContent,
  listContent,
  getContentById,
  updateContent,
  deleteContent,
  generateContent,
  AppError,
};
