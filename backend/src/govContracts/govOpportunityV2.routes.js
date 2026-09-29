/**
 * /api/v2/gov-opportunities — read-only, scoped.
 *
 * v1 routes are untouched. This is a new path, so existing consumers see no
 * change in behaviour, field set or semantics.
 *
 * Every handler is a READ. None creates canonical records, aliases, families or
 * snapshots, and none triggers a fetch or enrichment.
 */

const express = require('express');
const { verifyTokenOrApiKey } = require('../middleware/auth.middleware');
const { requireScope } = require('../middleware/scope.middleware');
const { errorResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');
const models = require('../models');
const svc = require('./govOpportunityV2.service');
const { PROPOSED_CONTRACT_CHANGES } = require('./govOpportunityV1.mapper');

const router = express.Router();

const SCOPE = 'read:gov_opportunities';

const fail = (res, code, errorCode, message) => res.status(code).json({
  status: 'error', message, code, errorCode,
});

// Contract metadata. Unauthenticated on purpose: it describes the shape, not
// the data, and lets a consumer check compatibility before wiring credentials.
router.get('/contract', (req, res) => res.status(200).json({
  status: 'success',
  message: 'Success',
  code: 200,
  data: {
    schemaVersion: 'gov-opportunity.v1',
    schemaSha256: 'd2a100c810244221c01b5550c43e78731509d72ec444e7055b01d989d94d37c8',
    schemaPath: 'contracts/gov-opportunity.v1/schema.json',
    requiredScope: SCOPE,
    deadlineStates: Object.keys(svc.DEADLINE_BUCKETS),
    proposedContractChanges: PROPOSED_CONTRACT_CHANGES,
  },
}));

router.use(verifyTokenOrApiKey, requireScope(SCOPE));

/**
 * GET /api/v2/gov-opportunities
 *   ?limit=1..100  &cursor=<opaque>  &deadlineState=<bucket>  &agency=<substring>
 *
 * deadlineState defaults to `all`. `verified` alone would silently hide every
 * legacy row, which is precisely the loss this bucket exists to prevent.
 */
router.get('/', async (req, res) => {
  try {
    const { deadlineState } = req.query;
    if (deadlineState && !Object.prototype.hasOwnProperty.call(svc.DEADLINE_BUCKETS, deadlineState)) {
      return fail(res, 400, 'invalid_parameter',
        `Unknown deadlineState. Expected one of: ${Object.keys(svc.DEADLINE_BUCKETS).join(', ')}.`);
    }
    if (req.query.limit !== undefined && Number.isNaN(Number(req.query.limit))) {
      return fail(res, 400, 'invalid_parameter', 'limit must be a number.');
    }
    if (req.query.cursor && svc.decodeCursor(req.query.cursor) === null) {
      return fail(res, 400, 'invalid_parameter', 'cursor is malformed.');
    }

    const out = await svc.listGovOpportunities(models, req.query);
    return res.status(200).json({
      status: 'success', message: 'Success', code: 200, ...out,
    });
  } catch (e) {
    logger.error('gov-opportunities v2 list failed', { error: e.message });
    return fail(res, 500, 'internal_error', 'Failed to list government opportunities.');
  }
});

/** GET /api/v2/gov-opportunities/:canonicalOpportunityId */
router.get('/:canonicalOpportunityId', async (req, res) => {
  try {
    const id = req.params.canonicalOpportunityId;
    if (!/^op:gov:[0-9a-f]{32}$/.test(id)) {
      return fail(res, 400, 'invalid_parameter', 'canonicalOpportunityId must match op:gov:<32 hex>.');
    }
    const found = await svc.getGovOpportunity(models, id);
    if (!found) return fail(res, 404, 'not_found', 'No such government opportunity.');
    return res.status(200).json({
      status: 'success',
      message: 'Success',
      code: 200,
      data: found.data,
      diagnostics: [found.diagnostics],
      meta: {
        schemaVersion: 'gov-opportunity.v1',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('gov-opportunities v2 detail failed', { error: e.message });
    return fail(res, 500, 'internal_error', 'Failed to fetch government opportunity.');
  }
});

/**
 * GET /api/v2/gov-opportunities/:canonicalOpportunityId/snapshots
 * Immutable source-observation history. Empty until ingestion writes snapshots;
 * an empty list means "none recorded", never "nothing happened".
 */
router.get('/:canonicalOpportunityId/snapshots', async (req, res) => {
  try {
    const id = req.params.canonicalOpportunityId;
    if (!/^op:gov:[0-9a-f]{32}$/.test(id)) {
      return fail(res, 400, 'invalid_parameter', 'canonicalOpportunityId must match op:gov:<32 hex>.');
    }
    const found = await svc.getGovOpportunity(models, id);
    if (!found) return fail(res, 404, 'not_found', 'No such government opportunity.');

    const canonicalUuid = found.data.sourceRecordId;
    const snapshots = await svc.listSnapshots(models, canonicalUuid);
    return res.status(200).json({
      status: 'success',
      message: 'Success',
      code: 200,
      data: snapshots,
      meta: {
        canonicalOpportunityId: id,
        recorded: snapshots.length,
        note: snapshots.length === 0
          ? 'No snapshots recorded for this record. This means none were written, not that the source never changed.'
          : undefined,
      },
    });
  } catch (e) {
    logger.error('gov-opportunities v2 snapshots failed', { error: e.message });
    return fail(res, 500, 'internal_error', 'Failed to fetch snapshots.');
  }
});

module.exports = router;
