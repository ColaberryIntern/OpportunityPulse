const { Op } = require('sequelize');
const { Content, User } = require('../models');
const { PAGINATION } = require('../config/constants');

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

module.exports = { search };
