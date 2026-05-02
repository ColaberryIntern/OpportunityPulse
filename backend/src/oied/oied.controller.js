const logger = require('../logging/logger');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const myOpps = require('./myOpportunities.service');
const actions = require('./actionGenerator.service');
const events = require('./events.service');

// GET /api/v1/oied/opportunities/my
async function listMy(req, res) {
  try {
    const { rows, total } = await myOpps.listMyOpportunities({
      limit: req.query.limit,
      offset: req.query.offset,
      type: req.query.type,
      minScore: req.query.minScore,
    });
    return paginatedResponse(res, rows, {
      total,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
  } catch (e) {
    logger.error('OIED listMy failed', { error: e.message });
    return errorResponse(res, 'Failed to list my opportunities', 500);
  }
}

// POST /api/v1/oied/opportunities/:id/generate
async function generate(req, res) {
  const opportunityId = Number(req.params.id);
  const type = String(req.body && req.body.type || '').toLowerCase();
  if (!opportunityId) return errorResponse(res, 'Invalid opportunity id', 400);
  if (!actions.ALLOWED_TYPES.includes(type)) {
    return errorResponse(res, `type must be one of: ${actions.ALLOWED_TYPES.join(', ')}`, 400);
  }
  try {
    const out = await actions.generateOutput({
      opportunityId,
      type,
      generatedBy: (req.user && req.user.id) || null,
    });
    // Side-effect: track 'generated' event.
    await events.recordEvent({
      opportunityId,
      eventType: 'generated',
      userId: (req.user && req.user.id) || null,
      payload: { outputType: type, outputId: out.id },
    }).catch(() => {});
    return successResponse(res, out, 'Output generated', 201);
  } catch (e) {
    logger.error('OIED generate failed', { id: opportunityId, type, error: e.message });
    return errorResponse(res, 'Generation failed: ' + e.message, 500);
  }
}

// GET /api/v1/oied/opportunity-outputs?status=draft|approved|rejected&type=&opportunityId=
async function listOutputs(req, res) {
  try {
    const { rows, total } = await actions.listOutputs(req.query);
    return paginatedResponse(res, rows, {
      total,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
  } catch (e) {
    logger.error('OIED listOutputs failed', { error: e.message });
    return errorResponse(res, 'Failed to list outputs', 500);
  }
}

async function getOutput(req, res) {
  try {
    const row = await actions.getOutput(Number(req.params.id));
    if (!row) return errorResponse(res, 'Not found', 404);
    return successResponse(res, row);
  } catch (e) {
    return errorResponse(res, 'Failed to fetch output', 500);
  }
}

// PATCH /api/v1/oied/opportunity-outputs/:id/status
async function patchOutput(req, res) {
  try {
    const updated = await actions.updateOutputStatus(Number(req.params.id), {
      status: req.body && req.body.status,
      content: req.body && req.body.content,
      reviewerId: (req.user && req.user.id) || null,
      reviewNotes: req.body && req.body.reviewNotes,
    });
    if (!updated) return errorResponse(res, 'Not found', 404);

    // Track approve/reject events.
    if (req.body && (req.body.status === 'approved' || req.body.status === 'rejected')) {
      await events.recordEvent({
        opportunityId: updated.opportunityId,
        eventType: req.body.status,
        userId: (req.user && req.user.id) || null,
        payload: { outputId: updated.id, outputType: updated.type },
      }).catch(() => {});
    } else if (req.body && req.body.content) {
      await events.recordEvent({
        opportunityId: updated.opportunityId,
        eventType: 'edited',
        userId: (req.user && req.user.id) || null,
        payload: { outputId: updated.id },
      }).catch(() => {});
    }
    return successResponse(res, updated);
  } catch (e) {
    logger.error('OIED patchOutput failed', { id: req.params.id, error: e.message });
    return errorResponse(res, 'Update failed: ' + e.message, 500);
  }
}

// POST /api/v1/oied/opportunity-events
// Body: { opportunityId, eventType, payload? }
async function postEvent(req, res) {
  try {
    const ev = await events.recordEvent({
      opportunityId: req.body && Number(req.body.opportunityId),
      eventType: req.body && req.body.eventType,
      userId: (req.user && req.user.id) || null,
      payload: (req.body && req.body.payload) || {},
    });
    return successResponse(res, ev, 'Event recorded', 201);
  } catch (e) {
    return errorResponse(res, e.message, 400);
  }
}

module.exports = {
  listMy,
  generate,
  listOutputs,
  getOutput,
  patchOutput,
  postEvent,
};
