const { Op } = require('sequelize');
const { Content, User, Opportunity } = require('../models');
const { PAGINATION } = require('../config/constants');
const { getAIClient } = require('../analysis/ai.client');
const logger = require('../logging/logger');

/**
 * Search content with keyword, filters, pagination, and sorting.
 */
async function search({
  q,
  category,
  tags,
  status,
  dateFrom,
  dateTo,
  page,
  limit,
  sort,
} = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const offset = (safePage - 1) * safeLimit;

  // Build where clause
  const where = {};

  // Keyword search on title and body (case-insensitive)
  if (q && q.trim()) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${q.trim()}%` } },
      { body: { [Op.iLike]: `%${q.trim()}%` } },
    ];
  }

  // Exact filters
  if (category) where.category = category;
  if (status) where.status = status;

  // Tags filter (overlap — content has any of the provided tags)
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      where.tags = { [Op.overlap]: tagList };
    }
  }

  // Date range filter
  if (dateFrom || dateTo) {
    const dateCondition = {};
    let hasDateFilter = false;
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) {
        dateCondition[Op.gte] = from;
        hasDateFilter = true;
      }
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        dateCondition[Op.lte] = to;
        hasDateFilter = true;
      }
    }
    if (hasDateFilter) {
      where.created_at = dateCondition;
    }
  }

  // Sort order
  const order = sort === 'oldest'
    ? [['created_at', 'ASC']]
    : [['created_at', 'DESC']];

  const { rows: results, count: total } = await Content.findAndCountAll({
    where,
    include: [{ model: User, as: 'author', attributes: ['id', 'email', 'name'] }],
    order,
    limit: safeLimit,
    offset,
  });

  // Build filters echo for response
  const filters = {};
  if (q) filters.q = q;
  if (category) filters.category = category;
  if (tags) filters.tags = tags;
  if (status) filters.status = status;
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  if (sort) filters.sort = sort;

  return {
    results,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
    filters,
  };
}

/**
 * Natural language search: parse user query with AI, then search Opportunities.
 */
async function naturalLanguageSearch(query) {
  const aiClient = getAIClient();

  const systemPrompt = `You are a search query parser for a government contracts and AI jobs platform. Extract structured search filters from the user's natural language query. Return a JSON object with these optional fields:
- type: "gov_contract", "ai_job", or "investment" (if specified)
- keywords: array of search keywords
- location: state code or location name
- minValue: minimum dollar value (number only)
- category: NAICS code or category name
Only include fields that are clearly specified in the query. Return empty object {} if the query is too vague.`;

  const { content } = await aiClient.chat(systemPrompt, query, { temperature: 0.1, maxTokens: 500 });
  let filters;
  try {
    filters = JSON.parse(content);
  } catch {
    filters = {};
  }

  logger.info('NL search parsed filters', { query, filters });

  // Build Opportunity query from extracted filters
  const where = { status: 'active' };

  if (filters.type) where.type = filters.type;
  if (filters.location) {
    where.location = { [Op.iLike]: `%${filters.location}%` };
  }
  if (filters.minValue) {
    where.value = { [Op.gte]: parseFloat(filters.minValue) };
  }
  if (filters.category) {
    where.category = { [Op.iLike]: `%${filters.category}%` };
  }

  // Keyword search across title and description
  if (filters.keywords && filters.keywords.length > 0) {
    const keywordConditions = filters.keywords.map(kw => ({
      [Op.or]: [
        { title: { [Op.iLike]: `%${kw}%` } },
        { description: { [Op.iLike]: `%${kw}%` } },
      ],
    }));
    if (where[Op.or]) {
      // Merge with existing
      where[Op.and] = keywordConditions;
    } else {
      where[Op.and] = keywordConditions;
    }
  }

  const results = await Opportunity.findAll({
    where,
    order: [['ai_score', 'DESC NULLS LAST']],
    limit: 20,
    attributes: ['id', 'type', 'title', 'description', 'sourceUrl', 'category', 'aiScore', 'value', 'location', 'publishedAt'],
  });

  return { results, filters, originalQuery: query };
}

module.exports = { search, naturalLanguageSearch };
