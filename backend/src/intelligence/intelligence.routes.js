const { Router } = require('express');
const controller = require('./intelligence.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');

const router = Router();

// All intelligence endpoints require authentication
router.use(verifyToken);

// --- Public Read Endpoints (authenticated users) ---

/**
 * @swagger
 * /intelligence/domains:
 *   get:
 *     tags: [Intelligence]
 *     summary: List AI domain verticals with opportunity counts
 *     responses:
 *       200:
 *         description: List of AI domains
 */
router.get('/domains', controller.getDomains);

/**
 * @swagger
 * /intelligence/capabilities:
 *   get:
 *     tags: [Intelligence]
 *     summary: List AI capabilities with opportunity counts
 */
router.get('/capabilities', controller.getCapabilities);

/**
 * @swagger
 * /intelligence/intents:
 *   get:
 *     tags: [Intelligence]
 *     summary: List strategic intents with opportunity counts
 */
router.get('/intents', controller.getIntents);

/**
 * @swagger
 * /intelligence/monetization-angles:
 *   get:
 *     tags: [Intelligence]
 *     summary: List monetization angles with opportunity counts
 */
router.get('/monetization-angles', controller.getMonetizationAngles);

/**
 * @swagger
 * /intelligence/maturity-phases:
 *   get:
 *     tags: [Intelligence]
 *     summary: List maturity phases with opportunity counts
 */
router.get('/maturity-phases', controller.getMaturityPhases);

/**
 * @swagger
 * /intelligence/geographic-tags:
 *   get:
 *     tags: [Intelligence]
 *     summary: List geographic tags with opportunity counts
 */
router.get('/geographic-tags', controller.getGeographicTags);

/**
 * @swagger
 * /intelligence/meta-signals:
 *   get:
 *     tags: [Intelligence]
 *     summary: Get current meta AI signal values and trends
 */
router.get('/meta-signals', controller.getMetaSignals);

/**
 * @swagger
 * /intelligence/clusters:
 *   get:
 *     tags: [Intelligence]
 *     summary: List active strategic clusters with metrics
 */
router.get('/clusters', controller.getClusters);

/**
 * @swagger
 * /intelligence/heatmap:
 *   get:
 *     tags: [Intelligence]
 *     summary: Get domain vs demand heatmap matrix data
 */
router.get('/heatmap', controller.getHeatmap);

// --- Admin Endpoints ---

/**
 * @swagger
 * /intelligence/classify:
 *   post:
 *     tags: [Intelligence]
 *     summary: Admin - Trigger full classification pipeline
 */
router.post('/classify', checkPermissions(ROLES.ADMIN), controller.triggerClassify);

/**
 * @swagger
 * /intelligence/clusters/detect:
 *   post:
 *     tags: [Intelligence]
 *     summary: Admin - Trigger cluster detection
 */
router.post('/clusters/detect', checkPermissions(ROLES.ADMIN), controller.triggerClusterDetection);

/**
 * @swagger
 * /intelligence/meta-signals/compute:
 *   post:
 *     tags: [Intelligence]
 *     summary: Admin - Trigger meta signal computation
 */
router.post('/meta-signals/compute', checkPermissions(ROLES.ADMIN), controller.triggerMetaSignalComputation);

module.exports = router;
