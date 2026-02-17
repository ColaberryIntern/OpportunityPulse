const { DataSource, Opportunity, IngestionLog } = require('../models');
const { INGESTION_STATUS } = require('../config/constants');
const logger = require('../logging/logger');

const SamGovAdapter = require('./adapters/samGov.adapter');
const MockJobsAdapter = require('./adapters/mockJobs.adapter');
const MockInvestmentsAdapter = require('./adapters/mockInvestments.adapter');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Return the appropriate adapter instance for a given DataSource.
 * @param {object} dataSource - DataSource model instance.
 * @returns {BaseAdapter} Concrete adapter instance.
 */
function getAdapter(dataSource) {
  switch (dataSource.name) {
    case 'sam_gov':
      return new SamGovAdapter(dataSource);
    case 'mock_jobs':
      return new MockJobsAdapter(dataSource);
    case 'mock_investments':
      return new MockInvestmentsAdapter(dataSource);
    default:
      throw new AppError(`Unknown data source adapter: ${dataSource.name}`, 400);
  }
}

/**
 * Run ingestion for a single DataSource identified by name.
 *
 * Steps:
 * 1. Find DataSource by name
 * 2. Verify it is enabled
 * 3. Create an IngestionLog entry (status: running)
 * 4. Instantiate the correct adapter
 * 5. Fetch raw records, transform them, upsert into Opportunity table
 * 6. Update IngestionLog with final counts and status
 * 7. Update DataSource.lastRunAt and lastRunStatus
 *
 * @param {string} dataSourceName
 * @returns {Promise<object>} Summary of the ingestion run.
 */
async function runIngestion(dataSourceName) {
  // 1. Find DataSource
  const dataSource = await DataSource.findOne({ where: { name: dataSourceName } });
  if (!dataSource) {
    throw new AppError(`Data source '${dataSourceName}' not found.`, 404);
  }

  // 2. Check enabled
  if (!dataSource.enabled) {
    throw new AppError(`Data source '${dataSourceName}' is disabled.`, 400);
  }

  // 3. Create IngestionLog with status running
  const ingestionLog = await IngestionLog.create({
    dataSourceId: dataSource.id,
    status: INGESTION_STATUS.RUNNING,
    startedAt: new Date(),
  });

  let recordsFetched = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let recordsSkipped = 0;
  const errors = [];

  try {
    // 4. Get adapter
    const adapter = getAdapter(dataSource);

    // 5. Fetch and transform
    const rawRecords = await adapter.fetch();
    recordsFetched = rawRecords.length;

    const transformed = adapter.transform(rawRecords);

    // Upsert each opportunity
    for (const record of transformed) {
      try {
        const existing = await Opportunity.findOne({
          where: {
            source: record.source,
            sourceId: record.sourceId,
          },
        });

        if (existing) {
          // Update existing record
          await existing.update({
            ...record,
            dataSourceId: dataSource.id,
          });
          recordsUpdated++;
        } else {
          // Create new record
          await Opportunity.create({
            ...record,
            dataSourceId: dataSource.id,
          });
          recordsCreated++;
        }
      } catch (recordError) {
        recordsSkipped++;
        errors.push({
          sourceId: record.sourceId,
          error: recordError.message,
        });
        logger.warn(`Ingestion record error for ${record.sourceId}: ${recordError.message}`);
      }
    }

    // 6. Determine final status
    const finalStatus = errors.length > 0
      ? INGESTION_STATUS.PARTIAL
      : INGESTION_STATUS.SUCCESS;

    await ingestionLog.update({
      status: finalStatus,
      recordsFetched,
      recordsCreated,
      recordsUpdated,
      recordsSkipped,
      errors,
      completedAt: new Date(),
    });

    // 7. Update DataSource
    await dataSource.update({
      lastRunAt: new Date(),
      lastRunStatus: finalStatus,
    });

    const summary = {
      dataSource: dataSourceName,
      status: finalStatus,
      recordsFetched,
      recordsCreated,
      recordsUpdated,
      recordsSkipped,
      errors: errors.length,
      ingestionLogId: ingestionLog.id,
    };

    logger.info(`Ingestion complete for '${dataSourceName}':`, summary);
    return summary;
  } catch (error) {
    // Update log to failed
    await ingestionLog.update({
      status: INGESTION_STATUS.FAILED,
      recordsFetched,
      recordsCreated,
      recordsUpdated,
      recordsSkipped,
      errors: [...errors, { error: error.message }],
      completedAt: new Date(),
    });

    // Update DataSource
    await dataSource.update({
      lastRunAt: new Date(),
      lastRunStatus: INGESTION_STATUS.FAILED,
    });

    logger.error(`Ingestion failed for '${dataSourceName}': ${error.message}`);
    throw error;
  }
}

/**
 * Run ingestion for all enabled DataSource records sequentially.
 * @returns {Promise<object>} Aggregated summary of all runs.
 */
async function runAllEnabled() {
  const dataSources = await DataSource.findAll({ where: { enabled: true } });

  if (dataSources.length === 0) {
    return {
      message: 'No enabled data sources found.',
      results: [],
    };
  }

  const results = [];

  for (const ds of dataSources) {
    try {
      const result = await runIngestion(ds.name);
      results.push(result);
    } catch (error) {
      results.push({
        dataSource: ds.name,
        status: INGESTION_STATUS.FAILED,
        error: error.message,
      });
    }
  }

  return {
    message: `Ingestion completed for ${results.length} data source(s).`,
    results,
  };
}

/**
 * Get paginated ingestion logs with DataSource details.
 * @param {object} options - { page, limit, offset, dataSourceId }
 * @returns {Promise<object>} { logs, pagination }
 */
async function getIngestionLogs({ page, limit, offset, dataSourceId } = {}) {
  const where = {};
  if (dataSourceId) {
    where.dataSourceId = dataSourceId;
  }

  const { rows: logs, count: total } = await IngestionLog.findAndCountAll({
    where,
    include: [{ model: DataSource, as: 'dataSource', attributes: ['id', 'name', 'type'] }],
    order: [['started_at', 'DESC']],
    limit,
    offset,
  });

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get all DataSource records.
 * @returns {Promise<Array>}
 */
async function getAllDataSources() {
  const dataSources = await DataSource.findAll({
    order: [['name', 'ASC']],
  });
  return dataSources;
}

module.exports = {
  runIngestion,
  runAllEnabled,
  getIngestionLogs,
  getAllDataSources,
  getAdapter,
  AppError,
};
