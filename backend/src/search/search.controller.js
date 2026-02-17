const searchService = require('./search.service');
const { successResponse } = require('../utils/apiResponse');

async function search(req, res, next) {
  try {
    const { q, category, tags, status, dateFrom, dateTo, page, limit, sort } = req.query;
    const result = await searchService.search({
      q, category, tags, status, dateFrom, dateTo, page, limit, sort,
    });
    return successResponse(res, result, 'Search completed.');
  } catch (error) {
    next(error);
  }
}

module.exports = { search };
