const { PAGINATION } = require('../config/constants');

/**
 * Parse pagination parameters from query string.
 * Enforces defaults and maximum limits.
 */
function parsePagination(query) {
  let page = parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE;
  let limit = parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT;

  if (page < 1) page = 1;
  if (limit < 1) limit = PAGINATION.DEFAULT_LIMIT;
  if (limit > PAGINATION.MAX_LIMIT) limit = PAGINATION.MAX_LIMIT;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Build pagination metadata for response.
 */
function buildPaginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

module.exports = {
  parsePagination,
  buildPaginationMeta,
};
