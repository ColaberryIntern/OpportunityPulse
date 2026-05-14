// Research Intelligence — controller for the research-specific endpoints.
//
//   GET  /api/v1/oied/research/search?q=...          — semantic search
//   GET  /api/v1/oied/research/opportunities/:id/similar — related opps
//   GET  /api/v1/oied/research/topics                — top topics by momentum
//   GET  /api/v1/oied/research/authors               — top authors
//   POST /api/v1/oied/research/embed                 — admin: run embedding batch
//   GET  /api/v1/oied/research/graph/:topic          — Phase 3c topic graph

const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const semanticSearch = require('./semanticSearch.service');
const researchAgg = require('./researchAggregation.service');
const researchGraph = require('./researchGraph.service');

async function search(req, res) {
  try {
    const q = req.query.q || req.query.query || '';
    const channels = req.query.channels
      ? String(req.query.channels).split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const limit = Number(req.query.limit) || 20;
    const out = await semanticSearch.semanticSearch(q, { limit, channels });
    return successResponse(res, out);
  } catch (e) {
    logger.error('research.search failed', { error: e.message });
    return errorResponse(res, 'Semantic search failed: ' + e.message, 500);
  }
}

async function similar(req, res) {
  try {
    const out = await semanticSearch.findSimilar(req.params.id, {
      limit: Number(req.query.limit) || 10,
    });
    return successResponse(res, out);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    logger.error('research.similar failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Find-similar failed: ' + e.message, 500);
  }
}

async function topTopics(req, res) {
  try {
    const topics = await researchAgg.getTopTopics(Number(req.query.limit) || 25);
    return successResponse(res, { topics });
  } catch (e) {
    logger.error('research.topTopics failed', { error: e.message });
    return errorResponse(res, 'Failed to load research topics', 500);
  }
}

async function topAuthors(req, res) {
  try {
    const authors = await researchAgg.getTopAuthors(Number(req.query.limit) || 25);
    return successResponse(res, { authors });
  } catch (e) {
    logger.error('research.topAuthors failed', { error: e.message });
    return errorResponse(res, 'Failed to load research authors', 500);
  }
}

// Admin — kick an embedding batch on demand (the cron does it daily).
async function runEmbedding(req, res) {
  try {
    const run = await semanticSearch.embedOpportunities({
      type: req.body?.type || 'research',
      limit: Number(req.body?.limit) || 200,
      force: req.body?.force === true,
    });
    return successResponse(res, {
      status: run.status,
      input: run.inputCount,
      output: run.outputCount,
      results: run.results,
    }, 'Embedding batch complete');
  } catch (e) {
    logger.error('research.runEmbedding failed', { error: e.message });
    return errorResponse(res, 'Embedding batch failed: ' + e.message, 500);
  }
}

// Phase 3c — topic graph: a topic + the opps/authors/cross-channel links
// that hang off it.
async function topicGraph(req, res) {
  try {
    const out = await researchGraph.buildTopicGraph(req.params.topic, {
      limit: Number(req.query.limit) || 25,
    });
    return successResponse(res, out);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return errorResponse(res, e.message, 404);
    logger.error('research.topicGraph failed', { topic: req.params.topic, error: e.message });
    return errorResponse(res, 'Topic graph failed: ' + e.message, 500);
  }
}

module.exports = {
  search,
  similar,
  topTopics,
  topAuthors,
  runEmbedding,
  topicGraph,
};
