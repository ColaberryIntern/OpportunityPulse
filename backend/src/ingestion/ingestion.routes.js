const express = require('express');
const router = express.Router();
const ingestionController = require('./ingestion.controller');
const { triggerIngestionValidation } = require('./ingestion.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');

// All ingestion routes require authentication and admin role
router.use(verifyToken);
router.use(checkPermissions(ROLES.ADMIN));

/**
 * @swagger
 * /ingestion/run/{name}:
 *   post:
 *     tags: [Ingestion]
 *     summary: Trigger ingestion for a single data source (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Data source name
 *     responses:
 *       200:
 *         description: Ingestion triggered successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
// POST /run/:name — trigger ingestion for a single data source
router.post(
  '/run/:name',
  triggerIngestionValidation,
  handleValidationErrors,
  ingestionController.triggerIngestion
);

/**
 * @swagger
 * /ingestion/run-all:
 *   post:
 *     tags: [Ingestion]
 *     summary: Trigger ingestion for all enabled data sources (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All ingestions triggered successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
// POST /run-all — trigger ingestion for all enabled data sources
router.post(
  '/run-all',
  ingestionController.triggerAllIngestion
);

/**
 * @swagger
 * /ingestion/logs:
 *   get:
 *     tags: [Ingestion]
 *     summary: Get ingestion logs (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: dataSourceId
 *         schema:
 *           type: integer
 *         description: Filter by data source ID
 *     responses:
 *       200:
 *         description: Paginated ingestion logs
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
// GET /logs — paginated ingestion logs
router.get(
  '/logs',
  ingestionController.getIngestionLogs
);

/**
 * @swagger
 * /ingestion/data-sources:
 *   get:
 *     tags: [Ingestion]
 *     summary: List all data sources (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of data sources
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
// GET /data-sources — list all data sources
router.get(
  '/data-sources',
  ingestionController.getDataSources
);

module.exports = router;
