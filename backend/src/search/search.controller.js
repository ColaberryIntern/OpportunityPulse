const searchService = require('./search.service');
const { successResponse, errorResponse } = require('../utils/apiResponse');

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

async function naturalLanguageSearch(req, res) {
  try {
    const result = await searchService.naturalLanguageSearch(req.body.query);
    return successResponse(res, result, 'Natural language search completed.');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

module.exports = { search, naturalLanguageSearch };
