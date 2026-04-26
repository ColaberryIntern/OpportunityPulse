const logger = require('../logging/logger');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const strategist = require('./bonfireStrategist.service');

let inFlight = false;

async function listStrategic(req, res) {
  try {
    const { rows, total } = await strategist.listStrategic(req.query);
    return paginatedResponse(res, rows, {
      total,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
  } catch (e) {
    logger.error('Strategic list failed', { error: e.message });
    return errorResponse(res, 'Failed to list strategic opportunities', 500);
  }
}

async function getStrategic(req, res) {
  try {
    const row = await strategist.getStrategic(req.params.id);
    if (!row) return errorResponse(res, 'Not found', 404);
    return successResponse(res, row);
  } catch (e) {
    logger.error('Strategic get failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to fetch strategic opportunity', 500);
  }
}

async function triggerRun(req, res) {
  if (inFlight) return errorResponse(res, 'A strategist run is already in progress', 409);
  const force = req.body && req.body.force === true;
  inFlight = true;
  setImmediate(async () => {
    try {
      const out = await strategist.runStrategist({ force });
      logger.info('Strategist run finished', out);
    } catch (e) {
      logger.error('Strategist run threw', { error: e.message });
    } finally {
      inFlight = false;
    }
  });
  return res.status(202).json({
    status: 'success',
    message: 'Strategist run accepted',
    data: { force },
  });
}

async function patchStatus(req, res) {
  try {
    const updated = await strategist.updateStrategicStatus(req.params.id, req.body || {});
    if (!updated) return errorResponse(res, 'Not found', 404);
    return successResponse(res, updated);
  } catch (e) {
    logger.error('Strategic patch failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Failed to update', 500);
  }
}

module.exports = { listStrategic, getStrategic, triggerRun, patchStatus };
