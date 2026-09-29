/**
 * /api/v2/gov-opportunities — read-only, scoped.
 *
 * v1 routes are untouched. Every handler is a READ: nothing creates canonical
 * records, aliases, families or snapshots, and nothing triggers a fetch or
 * enrichment. Ingestion owns all writes.
 *
 * Unsupported query parameters are REJECTED rather than ignored. Silently
 * dropping a filter is how a consumer ends up believing it narrowed a result
 * set that it did not.
 */

const express = require('express');
const { verifyTokenOrApiKey } = require('../middleware/auth.middleware');
const { requireScope } = require('../middleware/scope.middleware');
const logger = require('../logging/logger');
const models = require('../models');
const svc = require('./govOpportunityV2.service');
const { PROPOSED_CONTRACT_CHANGES } = require('./govOpportunityV1.mapper');

const router = express.Router();
const SCOPE = 'read:gov_opportunities';
const ID_RE = /^op:gov:[0-9a-f]{32}$/;

const fail = (res, code, errorCode, message, extra = {}) => res.status(code).json({
  status: 'error', message, code, errorCode, ...extra,
});

/** Reject anything outside the documented parameter set. */
function rejectUnsupportedParams(query, supported, res) {
  const unknown = Object.keys(query || {}).filter((k) => !supported.includes(k));
  if (unknown.length) {
    fail(res, 400, 'unsupported_parameter',
      `Unsupported query parameter(s): ${unknown.join(', ')}. Supported: ${supported.join(', ')}.`,
      { unsupportedParameters: unknown, supportedParameters: supported });
    return true;
  }
  return false;
}

// Contract metadata. Unauthenticated on purpose: it describes the shape, not
// the data, so a consumer can check compatibility before wiring credentials.
router.get('/contract', (req, res) => res.status(200).json({
  status: 'success',
  message: 'Success',
  code: 200,
  data: {
    schemaVersion: 'gov-opportunity.v1',
    schemaPath: 'contracts/gov-opportunity.v1/schema.json',
    // The schema file is byte-identical across b9b8905 and c0d942ed; the two
    // hashes previously reported differ ONLY by line endings. The committed
    // blob is LF (enforced by .gitattributes); the CRLF value is what a
    // Windows working-copy checkout hashes to. There is no third version.
    schemaSha256: {
      committedBlobLf: '26ff667ed6d669d35fc89dc13886042f23620b1b9cf97b0fc90f1597d6cdd6bb',
      windowsCheckoutCrlf: 'd2a100c810244221c01b5550c43e78731509d72ec444e7055b01d989d94d37c8',
      authoritative: 'committedBlobLf',
      note: 'Hash the git blob (git cat-file blob HEAD:contracts/gov-opportunity.v1/schema.json), not the working copy.',
    },
    requiredScope: SCOPE,
    deadlineStates: Object.keys(svc.DEADLINE_BUCKETS),
    supportedListParameters: svc.SUPPORTED_LIST_PARAMS,
    supportedDetailParameters: svc.SUPPORTED_DETAIL_PARAMS,
    proposedContractChanges: PROPOSED_CONTRACT_CHANGES,
  },
}));

router.use(verifyTokenOrApiKey, requireScope(SCOPE));

/**
 * GET /api/v2/gov-opportunities
 *   ?limit=1..100 &cursor=<opaque> &deadlineState=<bucket> &agency=<substring>
 *   &updatedSince=<iso8601>
 *
 * deadlineState defaults to `all`; defaulting to `verified` would silently hide
 * every legacy row, which is the loss the buckets exist to prevent.
 */
router.get('/', async (req, res) => {
  try {
    if (rejectUnsupportedParams(req.query, svc.SUPPORTED_LIST_PARAMS, res)) return undefined;

    const { deadlineState, limit, cursor, updatedSince } = req.query;
    if (deadlineState && !Object.prototype.hasOwnProperty.call(svc.DEADLINE_BUCKETS, deadlineState)) {
      return fail(res, 400, 'invalid_parameter',
        `Unknown deadlineState. Expected one of: ${Object.keys(svc.DEADLINE_BUCKETS).join(', ')}.`);
    }
    if (limit !== undefined && Number.isNaN(Number(limit))) {
      return fail(res, 400, 'invalid_parameter', 'limit must be a number.');
    }
    if (cursor && svc.decodeCursor(cursor) === null) {
      return fail(res, 400, 'invalid_parameter', 'cursor is malformed.');
    }
    if (updatedSince && Number.isNaN(new Date(updatedSince).getTime())) {
      return fail(res, 400, 'invalid_parameter', 'updatedSince must be an ISO-8601 timestamp.');
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

/**
 * GET /api/v2/gov-opportunities/:canonicalOpportunityId[?snapshotVersion=N]
 *
 * With snapshotVersion, returns that EXACT immutable snapshot rather than the
 * current projection. A pruned or absent version is a 404 naming the versions
 * that do exist — never a silently substituted current one.
 */
router.get('/:canonicalOpportunityId', async (req, res) => {
  try {
    if (rejectUnsupportedParams(req.query, svc.SUPPORTED_DETAIL_PARAMS, res)) return undefined;

    const id = req.params.canonicalOpportunityId;
    if (!ID_RE.test(id)) {
      return fail(res, 400, 'invalid_parameter', 'canonicalOpportunityId must match op:gov:<32 hex>.');
    }

    const found = await svc.getGovOpportunity(models, id);
    if (!found) return fail(res, 404, 'not_found', 'No such government opportunity.');

    const { snapshotVersion } = req.query;
    if (snapshotVersion !== undefined) {
      const v = Number(snapshotVersion);
      if (!Number.isInteger(v) || v < 1) {
        return fail(res, 400, 'invalid_parameter', 'snapshotVersion must be a positive integer.');
      }
      if (!found.canonical) {
        return fail(res, 404, 'snapshot_not_found',
          'This record has no persisted identity yet, so it has no snapshots.',
          { availableVersions: [] });
      }
      const snap = await svc.getSnapshot(models, found.canonical.canonicalId, v);
      if (!snap) {
        const all = await svc.listSnapshots(models, found.canonical.canonicalId);
        return fail(res, 404, 'snapshot_not_found',
          `Snapshot version ${v} does not exist for this record.`,
          { availableVersions: all.map((s) => s.version) });
      }
      return res.status(200).json({
        status: 'success',
        message: 'Success',
        code: 200,
        data: snap,
        meta: {
          canonicalOpportunityId: id,
          retrieval: 'exact_snapshot_version',
          note: 'Immutable source snapshot as observed. Not the current projection.',
        },
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Success',
      code: 200,
      data: found.data,
      diagnostics: [found.diagnostics],
      meta: {
        schemaVersion: 'gov-opportunity.v1',
        generatedAt: new Date().toISOString(),
        sourceSnapshotVersion: found.canonical ? found.canonical.sourceSnapshotVersion : null,
      },
    });
  } catch (e) {
    logger.error('gov-opportunities v2 detail failed', { error: e.message });
    return fail(res, 500, 'internal_error', 'Failed to fetch government opportunity.');
  }
});

/** GET /api/v2/gov-opportunities/:id/snapshots — immutable observation history. */
router.get('/:canonicalOpportunityId/snapshots', async (req, res) => {
  try {
    if (rejectUnsupportedParams(req.query, [], res)) return undefined;

    const id = req.params.canonicalOpportunityId;
    if (!ID_RE.test(id)) {
      return fail(res, 400, 'invalid_parameter', 'canonicalOpportunityId must match op:gov:<32 hex>.');
    }
    const found = await svc.getGovOpportunity(models, id);
    if (!found) return fail(res, 404, 'not_found', 'No such government opportunity.');

    const snapshots = found.canonical
      ? await svc.listSnapshots(models, found.canonical.canonicalId)
      : [];

    return res.status(200).json({
      status: 'success',
      message: 'Success',
      code: 200,
      data: snapshots,
      meta: {
        canonicalOpportunityId: id,
        recorded: snapshots.length,
        currentVersion: found.canonical ? found.canonical.sourceSnapshotVersion : null,
        note: snapshots.length === 0
          ? 'No snapshots recorded for this record. That means none were written, not that the source never changed.'
          : 'Snapshots are OBSERVATION history. A failed fetch observes nothing and writes none; '
            + 'see close_date_fetch_* on the record for attempt history.',
      },
    });
  } catch (e) {
    logger.error('gov-opportunities v2 snapshots failed', { error: e.message });
    return fail(res, 500, 'internal_error', 'Failed to fetch snapshots.');
  }
});

module.exports = router;
