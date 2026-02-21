const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const controller = require('./freelance.controller');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Freelance opportunity endpoints
router.get('/opportunities', controller.listOpportunities);
router.get('/opportunities/:id', controller.getOpportunity);

// Trend endpoints
router.get('/trends', controller.getTrends);
router.get('/trends/:skill', controller.getSkillTrendData);

// Action generation
router.post('/actions/:id/generate', controller.generateAction);

// Manual import
router.post('/import', controller.importProjects);

// Pipeline refresh (manual trigger for classification + scoring + snapshot)
router.post('/refresh-pipeline', controller.refreshPipeline);

module.exports = router;
