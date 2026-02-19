const aiToolService = require('./aiTool.service');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

async function listTools(req, res, next) {
  try {
    const { category, industry, q, trendDirection, sort, page, limit } = req.query;
    const result = await aiToolService.listAiTools({
      category,
      industry,
      q,
      trendDirection,
      sort,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return paginatedResponse(res, { tools: result.tools }, result.pagination, 'AI tools retrieved.');
  } catch (error) {
    logger.error('Failed to list AI tools', { error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function getToolBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const tool = await aiToolService.getAiToolBySlug(slug);
    return successResponse(res, { tool }, 'AI tool retrieved.');
  } catch (error) {
    logger.error('Failed to get AI tool', { slug: req.params.slug, error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function getTopTrending(req, res, next) {
  try {
    const { limit, industry, category } = req.query;
    const tools = await aiToolService.getTopTrendingTools({
      limit: limit ? parseInt(limit, 10) : 5,
      industry,
      category,
    });
    return successResponse(res, { tools }, 'Trending AI tools retrieved.');
  } catch (error) {
    logger.error('Failed to get trending AI tools', { error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function getToolStats(req, res, next) {
  try {
    const stats = await aiToolService.getAiToolStats();
    return successResponse(res, stats, 'AI tool stats retrieved.');
  } catch (error) {
    logger.error('Failed to get AI tool stats', { error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function getByIndustry(req, res, next) {
  try {
    const { industry } = req.params;
    const tools = await aiToolService.getToolsByIndustry(industry);
    return successResponse(res, { tools }, `AI tools for industry "${industry}" retrieved.`);
  } catch (error) {
    logger.error('Failed to get AI tools by industry', { industry: req.params.industry, error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function getToolMentions(req, res, next) {
  try {
    const { slug } = req.params;
    // First resolve slug to tool ID
    const tool = await aiToolService.getAiToolBySlug(slug);
    const { page, limit } = req.query;
    const result = await aiToolService.getMentionsForTool(tool.id, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return paginatedResponse(res, { mentions: result.mentions }, result.pagination, 'AI tool mentions retrieved.');
  } catch (error) {
    logger.error('Failed to get AI tool mentions', { slug: req.params.slug, error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function triggerTrendRefresh(req, res, next) {
  try {
    const aiToolAnalysis = require('./aiToolAnalysis.service');
    const result = await aiToolAnalysis.runToolTrendAnalysis();
    return successResponse(res, result, 'AI tool trend refresh triggered.');
  } catch (error) {
    logger.error('Failed to trigger trend refresh', { error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function triggerSeed(req, res, next) {
  try {
    const { seedAiTools } = require('./seed');
    const result = await seedAiTools();
    return successResponse(res, result, `AI tools seeded: ${result.created} created, ${result.skipped} skipped.`);
  } catch (error) {
    logger.error('Failed to seed AI tools', { error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

async function triggerDiscovery(req, res, next) {
  try {
    const aiToolAnalysis = require('./aiToolAnalysis.service');
    const result = await aiToolAnalysis.runToolDiscoveryPipeline();
    return successResponse(res, result, 'AI tool discovery pipeline completed.');
  } catch (error) {
    logger.error('Failed to run discovery pipeline', { error: error.message });
    if (error.statusCode) return errorResponse(res, error.message, error.statusCode);
    next(error);
  }
}

module.exports = {
  listTools,
  getToolBySlug,
  getTopTrending,
  getToolStats,
  getByIndustry,
  getToolMentions,
  triggerTrendRefresh,
  triggerSeed,
  triggerDiscovery,
};
