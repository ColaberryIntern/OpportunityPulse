const express = require('express');
const { body, param, query } = require('express-validator');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { checkSubscription } = require('../middleware/subscription.middleware');
const { analysisLimiter } = require('../middleware/rateLimiter.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const ctrl = require('./actionEngine.controller');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// --- Admin: batch operations ---
router.post('/classify',
  checkPermissions('admin'),
  analysisLimiter,
  ctrl.triggerClassification
);

router.post('/saturation',
  checkPermissions('admin'),
  analysisLimiter,
  ctrl.triggerSaturation
);

router.post('/recommendations',
  checkPermissions('admin'),
  analysisLimiter,
  ctrl.triggerRecommendations
);

router.post('/executive-brief',
  checkPermissions('admin'),
  analysisLimiter,
  ctrl.triggerExecutiveBrief
);

// --- Executive brief (premium users) ---
router.get('/executive-brief',
  cacheResponse('exec-brief', 900),
  ctrl.getExecutiveBriefHandler
);

// --- Opportunity action plans ---
router.get('/opportunity/:id/action-plan',
  param('id').isInt(),
  handleValidationErrors,
  ctrl.getOpportunityActionPlan
);

router.post('/opportunity/:id/generate-plan',
  param('id').isInt(),
  handleValidationErrors,
  analysisLimiter,
  ctrl.generateActionPlanHandler
);

// --- Action tracking CRUD ---
router.post('/actions',
  body('opportunityId').isInt(),
  body('actionType').optional().isIn(['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH']),
  body('notes').optional().isString().trim(),
  handleValidationErrors,
  ctrl.createActionHandler
);

router.put('/actions/:id',
  param('id').isInt(),
  body('status').optional().isIn(['planned', 'in_progress', 'executed', 'abandoned']),
  body('revenueGenerated').optional().isDecimal(),
  body('notes').optional().isString().trim(),
  handleValidationErrors,
  ctrl.updateActionHandler
);

router.get('/actions',
  query('status').optional().isIn(['planned', 'in_progress', 'executed', 'abandoned']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  handleValidationErrors,
  ctrl.listActionsHandler
);

router.delete('/actions/:id',
  param('id').isInt(),
  handleValidationErrors,
  ctrl.deleteActionHandler
);

// --- Analytics ---
router.get('/analytics', ctrl.getAnalyticsHandler);

module.exports = router;
