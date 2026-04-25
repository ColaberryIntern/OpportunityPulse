const crypto = require('crypto');
const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { runScrape, isScraperEnabled } = require('./scraper');

// Tracks the most recent run summary in-memory so the same admin who triggered
// a run can poll for results. Only the latest run is retained — this is a
// prototype, not a job queue.
let lastRunSummary = null;
let inFlight = false;

function getFlag(req, res) {
  return successResponse(res, { enabled: isScraperEnabled() });
}

async function triggerRun(req, res) {
  if (!isScraperEnabled()) {
    return errorResponse(res, 'Scraper is disabled', 503);
  }
  if (inFlight) {
    return errorResponse(res, 'A scrape run is already in progress', 409);
  }
  const runId = crypto.randomBytes(8).toString('hex');
  const opts = {
    phase: req.body && req.body.phase ? String(req.body.phase).toUpperCase() : undefined,
    agencies: req.body && Array.isArray(req.body.agencies) ? req.body.agencies : undefined,
    dryRun: req.body && req.body.dryRun === true,
  };

  // Run in background. The 202 returns immediately; the caller polls /scrape/status.
  inFlight = true;
  setImmediate(async () => {
    try {
      logger.info('Bonfire scrape run starting', { runId, opts });
      const summary = await runScrape(opts);
      lastRunSummary = { runId, ...summary };
      logger.info('Bonfire scrape run finished', { runId, summary });
    } catch (e) {
      logger.error('Bonfire scrape run threw', { runId, error: e.message });
      lastRunSummary = {
        runId,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        errors: [{ stage: 'unhandled', reason: e.message }],
        escalated: true,
      };
    } finally {
      inFlight = false;
    }
  });

  return res.status(202).json({
    status: 'success',
    message: 'Scrape run accepted',
    data: { runId, opts },
  });
}

function getStatus(req, res) {
  return successResponse(res, {
    inFlight,
    lastRun: lastRunSummary,
  });
}

module.exports = { getFlag, triggerRun, getStatus };
