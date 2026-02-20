const express = require('express');
const router = express.Router();
const controller = require('./aiTool.controller');
const { listToolsValidation } = require('./aiTool.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');
const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(verifyToken);

// GET /ai-tools/stats — aggregate tool statistics
router.get('/stats', cacheResponse('aitools:stats', 300), controller.getToolStats);

// GET /ai-tools/trending — top trending tools
router.get('/trending', cacheResponse('aitools:trending', 120), controller.getTopTrending);

// GET /ai-tools/momentum — top tools by composite momentum score
router.get('/momentum', cacheResponse('aitools:momentum', 120), controller.getMomentumTools);

// GET /ai-tools/industry/:industry — tools filtered by industry
router.get('/industry/:industry', cacheResponse('aitools:industry', 180), controller.getByIndustry);

// GET /ai-tools — list all tools with filters, search, pagination
router.get('/', cacheResponse('aitools:list', 60), listToolsValidation, handleValidationErrors, controller.listTools);

// GET /ai-tools/:slug — single tool detail with recent mentions
router.get('/:slug', cacheResponse('aitools:detail', 120), controller.getToolBySlug);

// GET /ai-tools/:slug/mentions — paginated mentions for a tool
router.get('/:slug/mentions', controller.getToolMentions);

// POST /ai-tools/refresh-trends — admin-only trend refresh trigger
router.post('/refresh-trends', checkPermissions(ROLES.ADMIN), controller.triggerTrendRefresh);

// POST /ai-tools/seed — admin-only, trigger seed of base AI tools
router.post('/seed', checkPermissions(ROLES.ADMIN), controller.triggerSeed);

// POST /ai-tools/discover — admin-only, trigger discovery pipeline (GitHub + Product Hunt)
router.post('/discover', checkPermissions(ROLES.ADMIN), controller.triggerDiscovery);

module.exports = router;
