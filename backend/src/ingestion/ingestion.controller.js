const ingestionService = require('./ingestion.service');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const { parsePagination } = require('../utils/pagination');
const { logAuditEvent } = require('../logging/audit.service');

/**
 * Trigger ingestion for a single data source by name.
 * POST /run/:name
 */
async function triggerIngestion(req, res, next) {
  try {
    const { name } = req.params;
    const summary = await ingestionService.runIngestion(name);

    logAuditEvent({
      userId: req.user.userId,
      action: 'ingestion_triggered',
      resource: 'ingestion',
      resourceId: name,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { summary }, `Ingestion completed for '${name}'.`);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Trigger ingestion for all enabled data sources.
 * POST /run-all
 */
async function triggerAllIngestion(req, res, next) {
  try {
    const summary = await ingestionService.runAllEnabled();

    logAuditEvent({
      userId: req.user.userId,
      action: 'ingestion_all_triggered',
      resource: 'ingestion',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, { summary }, summary.message);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Get paginated ingestion logs.
 * GET /logs
 */
async function getIngestionLogs(req, res, next) {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { dataSourceId } = req.query;

    const result = await ingestionService.getIngestionLogs({
      page,
      limit,
      offset,
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : undefined,
    });

    return paginatedResponse(res, result.logs, result.pagination, 'Ingestion logs retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

/**
 * Get all data sources.
 * GET /data-sources
 */
async function getDataSources(req, res, next) {
  try {
    const dataSources = await ingestionService.getAllDataSources();
    return successResponse(res, { dataSources }, 'Data sources retrieved.');
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.message, error.statusCode);
    }
    next(error);
  }
}

module.exports = {
  triggerIngestion,
  triggerAllIngestion,
  getIngestionLogs,
  getDataSources,
};
