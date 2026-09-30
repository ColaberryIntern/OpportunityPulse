// Phase 2 — /api/v2/gov-opportunities and the v1 contract mapping.
//
// Every payload this API emits is validated against the PINNED schema with a
// real JSON Schema 2020-12 implementation. That is the point of the exercise:
// a mapper that "looks right" but emits a field v1 does not define would be
// caught here rather than by Enterprise.

const path = require('path');
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const SCHEMA_PATH = path.join(__dirname, '../../../contracts/gov-opportunity.v1/schema.json');
const SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(SCHEMA);

const assertValid = (doc, label) => {
  if (!validate(doc)) {
    throw new Error(`${label} failed pinned-schema validation:\n${JSON.stringify(validate.errors, null, 2)}`);
  }
};

// ---------------------------------------------------------------- fixtures
const T_VERIFIED = new Date('2026-09-20T00:00:00.000Z');

function rowVerified(over = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    externalId: 'bonfire:agency:utah:R-1',
    title: 'AI Analytics Platform',
    agency: 'State of Utah (U3P)',
    sourceUrl: 'https://utah.bonfirehub.com/opportunities/1',
    aiCategory: 'IT Services',
    fitScore: 70,
    priorityScore: 54,
    estimatedValue: '25000000',
    enrichedAt: new Date('2026-09-01T00:00:00.000Z'),
    enrichmentVersion: 1,
    pursuitStatus: 'none',
    vetVerdict: null,
    attachmentsFetchedAt: null,
    closeDate: new Date('2026-10-15T20:00:00.000Z'),
    closeDateVerifiedAt: T_VERIFIED,
    closeDateVerifiedSource: 'portal_scrape',
    closeDateObservedAt: T_VERIFIED,
    closeDateObservationUtc: new Date('2026-10-15T20:00:00.000Z'),
    closeDateObservationConfidence: 'high',
    closeDateRaw: 'Oct 15th 2026, 2:00 PM MDT',
    closeDateTimezone: 'MDT',
    closeDateTimezoneSource: 'abbreviation',
    closeDateOffsetMinutes: -360,
    closeDateUncertainty: null,
    closeDateSourceState: 'published_parsed',
    closeDateFetchAttemptedAt: T_VERIFIED,
    closeDateFetchStatus: 'success',
    closeDateFetchError: null,
    closeDateCandidates: null,
    closeDateConservativeUtc: null,
    closeDateSuperseded: null,
    ...over,
  };
}

// The legacy shape: a value exists, nothing verified it, no recorded failure.
const rowLegacy = (over = {}) => rowVerified({
  id: '22222222-2222-4222-8222-222222222222',
  externalId: 'bonfire:agency:utah:R-2',
  closeDate: new Date('2026-10-15T14:00:00.000Z'),
  closeDateVerifiedAt: null,
  closeDateVerifiedSource: null,
  closeDateObservedAt: null,
  closeDateObservationUtc: null,
  closeDateObservationConfidence: null,
  closeDateRaw: null,
  closeDateTimezone: null,
  closeDateTimezoneSource: null,
  closeDateOffsetMinutes: null,
  closeDateUncertainty: null,
  closeDateSourceState: null,
  closeDateFetchAttemptedAt: null,
  closeDateFetchStatus: null,
  ...over,
});

const rowFetchFailed = (over = {}) => rowVerified({
  id: '33333333-3333-4333-8333-333333333333',
  externalId: 'bonfire:agency:utah:R-3',
  closeDateFetchStatus: 'failed',
  closeDateFetchError: 'HTTP 403 (bot protection)',
  closeDateFetchAttemptedAt: new Date('2026-09-28T00:00:00.000Z'),
  ...over,
});

let ROWS = [];

// Auth is stubbed to a simple "is there a principal?" check so the REAL scope
// guard (requireScope) is the thing under test rather than JWT/API-key plumbing,
// which has its own coverage.
jest.mock('../../src/middleware/auth.middleware', () => ({
  verifyToken: (req, res, next) => next(),
  verifyTokenOrApiKey: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Access denied. No authentication provided.', code: 401 });
    }
    return next();
  },
}));

jest.mock('../../src/models', () => ({
  // eslint-disable-next-line global-require
  BonfireOpportunity: {
    findAll: jest.fn(async (q) => {
      // eslint-disable-next-line global-require
      const store = global.__ROWS__ || [];
      if (q && q.attributes && q.attributes.length === 1) return store.map((r) => ({ id: r.id }));
      let out = store;
      const lim = q && q.limit;
      return lim ? out.slice(0, lim) : out;
    }),
    findByPk: jest.fn(async (id) => {
      const store = global.__ROWS__ || [];
      return store.find((r) => r.id === id) || null;
    }),
  },
  GovCanonicalOpportunity: null,
  GovSourceAlias: null,
  GovSourceSnapshot: null,
}));

const { toGovOpportunityV1, UNCERTAINTY_TO_V1, PROPOSED_CONTRACT_CHANGES, canonicalIdFor } = require('../../src/govContracts/govOpportunityV1.mapper');
const svc = require('../../src/govContracts/govOpportunityV2.service');

beforeEach(() => { global.__ROWS__ = ROWS; });

// ---------------------------------------------------------------- mapper
describe('mapper — payloads validate against the PINNED schema', () => {
  it.each([
    ['verified', rowVerified()],
    ['legacy unverified', rowLegacy()],
    ['fetch failed', rowFetchFailed()],
    ['never observed', rowLegacy({ closeDate: null, closeDateSourceState: 'not_observed' })],
    ['buyer published nothing', rowLegacy({ closeDate: null, closeDateSourceState: 'not_published' })],
    ['ambiguous with candidates', rowVerified({
      closeDate: null,
      closeDateVerifiedAt: null,
      closeDateUncertainty: 'dst_ambiguous',
      closeDateCandidates: [
        { utc: '2026-11-01T05:30:00.000Z', offsetMinutes: -240, source: 'portal', observedAt: '2026-09-20T00:00:00.000Z', originalText: 'Nov 1 1:30 AM ET' },
        { utc: '2026-11-01T06:30:00.000Z', offsetMinutes: -300, source: 'portal', observedAt: '2026-09-20T00:00:00.000Z', originalText: 'Nov 1 1:30 AM ET' },
      ],
      closeDateConservativeUtc: new Date('2026-11-01T05:30:00.000Z'),
    })],
  ])('%s', (label, row) => {
    const { envelope } = toGovOpportunityV1(row, {});
    assertValid(envelope, label);
  });
});

describe('mapper — uncertainty reasons map onto the frozen v1 enum', () => {
  const V1_ENUM = SCHEMA.properties.deadline.properties.uncertaintyReason.enum;

  it('every internal reason maps to a MEMBER of the frozen enum', () => {
    for (const [internal, mapped] of Object.entries(UNCERTAINTY_TO_V1)) {
      expect(V1_ENUM).toContain(mapped);
      expect(mapped).not.toBeNull(); // a real failure must never map to "no uncertainty"
    }
  });

  it.each([
    ['invalid_time', 'unparseable'],
    ['invalid_offset', 'unparseable'],
    ['unsupported_precision', 'unparseable'],
    ['dst_nonexistent', 'ambiguous_timezone'],
  ])('unsupported reason %s maps to %s', (internal, expected) => {
    expect(UNCERTAINTY_TO_V1[internal]).toBe(expected);
  });

  it('the DETAILED internal reason is retained outside the contract object', () => {
    const row = rowVerified({
      closeDate: null, closeDateVerifiedAt: null, closeDateUncertainty: 'invalid_offset',
    });
    const { envelope, diagnostics } = toGovOpportunityV1(row, {});
    expect(envelope.deadline.uncertaintyReason).toBe('unparseable'); // v1-legal
    expect(diagnostics.internalUncertaintyReason).toBe('invalid_offset'); // detail kept
    // ...and the contract object itself carries no extra field.
    assertValid(envelope, 'invalid_offset row');
  });

  it('proposes a coordinated v1.1 rather than silently widening the schema', () => {
    const ids = PROPOSED_CONTRACT_CHANGES.map((c) => c.id);
    expect(ids).toContain('v1.1-uncertainty-reasons');
    for (const c of PROPOSED_CONTRACT_CHANGES) {
      expect(c.compatibility).toMatch(/additive|optional/i);
    }
  });
});

describe('mapper — candidates become v1 conflict shape, not raw JSONB', () => {
  it('projects to exactly the v1 fields', () => {
    const row = rowVerified({
      closeDate: null,
      closeDateVerifiedAt: null,
      closeDateUncertainty: 'dst_ambiguous',
      closeDateCandidates: [{
        utc: '2026-11-01T05:30:00.000Z',
        offsetMinutes: -240, // internal-only; must NOT survive
        source: 'portal',
        observedAt: '2026-09-20T00:00:00.000Z',
        originalText: 'Nov 1 2026 1:30 AM Eastern Time',
      }],
    });
    const { envelope } = toGovOpportunityV1(row, {});
    const c = envelope.deadline.conflicts[0];
    expect(Object.keys(c).sort()).toEqual(['note', 'observedAt', 'originalText', 'source', 'supersedes', 'utc']);
    expect(c).not.toHaveProperty('offsetMinutes');
    expect(c.originalText).toBe('Nov 1 2026 1:30 AM Eastern Time');
    assertValid(envelope, 'candidate projection');
  });

  it('supplies required fields when the source omitted them', () => {
    const row = rowVerified({
      closeDate: null, closeDateVerifiedAt: null, closeDateUncertainty: 'dst_ambiguous',
      closeDateCandidates: [{ utc: '2026-11-01T05:30:00.000Z' }],
    });
    const { envelope } = toGovOpportunityV1(row, {});
    const c = envelope.deadline.conflicts[0];
    expect(typeof c.originalText).toBe('string');
    expect(typeof c.source).toBe('string');
    expect(typeof c.observedAt).toBe('string');
    assertValid(envelope, 'sparse candidate');
  });
});

describe('mapper — unverified values are surfaced, never silently dropped', () => {
  it('a legacy value is NOT published and NOT turned into a fabricated conflict', () => {
    const { envelope, diagnostics } = toGovOpportunityV1(rowLegacy(), {});
    expect(envelope.deadline.utc).toBeNull();
    expect(envelope.deadline.utcConfidence).toBe('unknown');
    // A single unverified value is not competing evidence. Inventing a second
    // "source" for it would assert disagreement that never existed.
    expect(envelope.deadline.conflicts).toEqual([]);
    expect(envelope.deadline.uncertaintyReason).toBeNull();
    // It is reported faithfully through diagnostics instead, and stays
    // addressable via the legacy_unverified bucket on the list endpoint.
    expect(diagnostics.effectiveState).toBe('legacy_unverified');
    expect(diagnostics.retainedUnverifiedUtc).toBe('2026-10-15T14:00:00.000Z');
  });

  it('real source candidates DO appear as conflicts', () => {
    const row = rowVerified({
      closeDate: null,
      closeDateVerifiedAt: null,
      closeDateUncertainty: 'dst_ambiguous',
      closeDateCandidates: [
        { utc: '2026-11-01T05:30:00.000Z', source: 'portal', observedAt: '2026-09-20T00:00:00.000Z', originalText: 'Nov 1 1:30 AM ET' },
        { utc: '2026-11-01T06:30:00.000Z', source: 'portal', observedAt: '2026-09-20T00:00:00.000Z', originalText: 'Nov 1 1:30 AM ET' },
      ],
    });
    const { envelope } = toGovOpportunityV1(row, {});
    expect(envelope.deadline.conflicts).toHaveLength(2);
    assertValid(envelope, 'genuine candidates');
  });

  it('a verified row publishes utc and verifiedAt', () => {
    const { envelope } = toGovOpportunityV1(rowVerified(), {});
    expect(envelope.deadline.utc).toBe('2026-10-15T20:00:00.000Z');
    expect(envelope.deadline.utcConfidence).toBe('high');
    expect(envelope.deadline.verifiedAt).toBe(T_VERIFIED.toISOString());
  });

  it('a failed fetch degrades sourceAvailability rather than looking current', () => {
    const { envelope } = toGovOpportunityV1(rowFetchFailed(), {});
    expect(envelope.sourceAvailability.status).toBe('degraded');
    expect(envelope.sourceAvailability.servingLastKnownSnapshot).toBe(true);
  });
});

describe('mapper — honest unknowns, no manufactured evidence', () => {
  it('never synthesises requirements from a title', () => {
    const { envelope } = toGovOpportunityV1(rowVerified(), {});
    expect(envelope.requirements).toEqual([]);
    expect(envelope.documents.coverage).toBe('inaccessible');
    expect(envelope.documents.items).toEqual([]);
  });

  it('classification basis is title when no document was read', () => {
    const { envelope } = toGovOpportunityV1(rowVerified(), {});
    expect(envelope.notice.procurementType.basis).toBe('title');
    expect(envelope.notice.procurementType.value).toBe('unknown');
    expect(envelope.sourceAssessment.relevanceBasis).toBe('title');
  });

  it('company qualification is always null', () => {
    const { envelope } = toGovOpportunityV1(rowVerified(), {});
    expect(envelope.companyQualification).toBeNull();
    expect(envelope.sourceAssessment.isNotEligibilityDetermination).toBe(true);
  });

  it('a model estimate is never presented as a published value', () => {
    const { envelope } = toGovOpportunityV1(rowVerified(), {});
    expect(envelope.value.published).toBeNull();
    expect(envelope.value.modelEstimate.notForRevenuePlanning).toBe(true);
  });
});

describe('canonical identity is opaque and stable', () => {
  it('is derived from the row key, not the title or solicitation number', () => {
    const a = canonicalIdFor('11111111-1111-4111-8111-111111111111');
    expect(a).toMatch(/^op:gov:[0-9a-f]{32}$/);
    expect(a).not.toContain('AI Analytics');
  });

  it('is stable across repeated derivation', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(canonicalIdFor(id)).toBe(canonicalIdFor(id));
  });

  it('does not change when the title changes', () => {
    const r1 = toGovOpportunityV1(rowVerified(), {}).envelope.canonicalOpportunityId;
    const r2 = toGovOpportunityV1(rowVerified({ title: 'Completely Different Title' }), {}).envelope.canonicalOpportunityId;
    expect(r1).toBe(r2);
  });

  it('differs between distinct notices', () => {
    const a = toGovOpportunityV1(rowVerified(), {}).envelope.canonicalOpportunityId;
    const b = toGovOpportunityV1(rowLegacy(), {}).envelope.canonicalOpportunityId;
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------- HTTP API
// Required ONCE, after the mocks above are registered. Calling
// jest.resetModules() per-app would discard those mocks and pull in the real
// models module, which opens a database connection.
const v2Router = require('../../src/govContracts/govOpportunityV2.routes');

function buildApp(user) {
  const app = express();
  // Inject an authenticated principal ahead of the router so the real scope
  // guard is exercised, not bypassed.
  app.use((req, _res, next) => { if (user) req.user = user; next(); });
  app.use('/api/v2/gov-opportunities', v2Router);
  return app;
}

const KEY_USER = { userId: 1, email: 'svc@example.com', scopes: ['read:gov_opportunities'], apiKey: true };
const NOSCOPE_USER = { userId: 2, email: 'other@example.com', scopes: ['read'], apiKey: true };
const ADMIN_USER = { userId: 3, role: 'admin' };

describe('API — authorization', () => {
  beforeEach(() => { ROWS = [rowVerified()]; global.__ROWS__ = ROWS; });

  it('401 with no authentication', async () => {
    const res = await request(buildApp(null)).get('/api/v2/gov-opportunities');
    expect(res.status).toBe(401);
  });

  it('403 when the scope is missing', async () => {
    const res = await request(buildApp(NOSCOPE_USER)).get('/api/v2/gov-opportunities');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/read:gov_opportunities/);
  });

  it('200 with the scope', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities');
    expect(res.status).toBe(200);
  });

  it('200 for a human admin', async () => {
    const res = await request(buildApp(ADMIN_USER)).get('/api/v2/gov-opportunities');
    expect(res.status).toBe(200);
  });

  it('the contract endpoint is reachable without credentials', async () => {
    const res = await request(buildApp(null)).get('/api/v2/gov-opportunities/contract');
    expect(res.status).toBe(200);
    // One schema, two hashing contexts. The committed LF blob is authoritative;
    // the CRLF value is what a Windows working-copy checkout hashes to.
    expect(res.body.data.schemaSha256.committedBlobLf)
      .toBe('26ff667ed6d669d35fc89dc13886042f23620b1b9cf97b0fc90f1597d6cdd6bb');
    expect(res.body.data.schemaSha256.windowsCheckoutCrlf)
      .toBe('d2a100c810244221c01b5550c43e78731509d72ec444e7055b01d989d94d37c8');
    expect(res.body.data.schemaSha256.authoritative).toBe('committedBlobLf');
    expect(res.body.data.requiredScope).toBe('read:gov_opportunities');
  });
});

describe('API — list payloads validate against the pinned schema', () => {
  beforeEach(() => { ROWS = [rowVerified(), rowLegacy(), rowFetchFailed()]; global.__ROWS__ = ROWS; });

  it('every returned object conforms', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities?limit=50');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((d, i) => assertValid(d, `list item ${i}`));
  });

  it('carries schemaVersion and generatedAt in meta', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities');
    expect(res.body.meta.schemaVersion).toBe('gov-opportunity.v1');
    expect(typeof res.body.meta.generatedAt).toBe('string');
  });

  it('reports degraded source availability when a fetch failed', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities?limit=50');
    expect(res.body.meta.sourceAvailability.length).toBeGreaterThan(0);
    expect(res.body.meta.sourceAvailability[0].status).toBe('degraded');
  });

  it('diagnostics ride OUTSIDE the contract objects', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities?limit=50');
    expect(Array.isArray(res.body.diagnostics)).toBe(true);
    for (const d of res.body.data) expect(d).not.toHaveProperty('diagnostics');
  });
});

describe('API — unverified records stay discoverable', () => {
  beforeEach(() => { ROWS = [rowVerified(), rowLegacy()]; global.__ROWS__ = ROWS; });

  it('exposes an explicit bucket set', async () => {
    const res = await request(buildApp(null)).get('/api/v2/gov-opportunities/contract');
    expect(res.body.data.deadlineStates).toEqual(
      expect.arrayContaining(['verified', 'legacy_unverified', 'retained_unverified', 'unverified', 'all']),
    );
  });

  it('defaults to `all`, so legacy rows are not hidden by default', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities');
    expect(res.body.meta.deadlineState).toBe('all');
  });

  it('rejects an unknown bucket rather than silently ignoring it', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities?deadlineState=nonsense');
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('invalid_parameter');
  });

  it('the legacy_unverified WHERE clause targets value-present + never-verified', () => {
    const w = svc.bucketWhere('legacy_unverified');
    expect(w.closeDateVerifiedAt).toBeNull();
    expect(w.closeDate).toBeDefined();
  });

  it('the verified bucket requires a verification that is still current', () => {
    const w = svc.bucketWhere('verified');
    expect(w.closeDateVerifiedAt).toBeDefined();
    expect(w.closeDate).toBeDefined();
    // The predicate is the column comparison, identical to
    // deadlineEvidence.isVerificationCurrent -- not a proxy such as
    // "uncertainty IS NULL", which is what let defect A through.
    const sql = JSON.stringify(w[Object.getOwnPropertySymbols(w).find((x) => String(x) === 'Symbol(and)')] || '');
    expect(sql).toMatch(/close_date_observed_at/);
    expect(sql).toMatch(/close_date_verified_at/);
  });
});

describe('API — pagination', () => {
  beforeEach(() => {
    ROWS = Array.from({ length: 7 }, (_, i) => rowVerified({
      id: `4444444${i}-4444-4444-8444-444444444444`,
      externalId: `bonfire:agency:utah:P-${i}`,
    }));
    global.__ROWS__ = ROWS;
  });

  it('honours limit and reports hasMore with a cursor', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities?limit=3');
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.hasMore).toBe(true);
    expect(typeof res.body.pagination.cursor).toBe('string');
    expect(res.body.pagination.limit).toBe(3);
  });

  it('clamps limit to the documented maximum', () => {
    expect(svc.clampLimit(1000)).toBe(svc.MAX_LIMIT);
    expect(svc.clampLimit(0)).toBe(svc.DEFAULT_LIMIT);
    expect(svc.clampLimit('abc')).toBe(svc.DEFAULT_LIMIT);
    expect(svc.clampLimit(5)).toBe(5);
  });

  it('cursors round-trip opaquely', () => {
    const c = svc.encodeCursor('abc-123');
    expect(c).not.toContain('abc-123');
    expect(svc.decodeCursor(c)).toBe('abc-123');
  });

  it('rejects a malformed limit', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities?limit=notanumber');
    expect(res.status).toBe(400);
  });
});

describe('API — detail and snapshots', () => {
  beforeEach(() => { ROWS = [rowVerified()]; global.__ROWS__ = ROWS; });

  it('400 on a malformed canonical id', async () => {
    const res = await request(buildApp(KEY_USER)).get('/api/v2/gov-opportunities/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('invalid_parameter');
  });

  it('404 on an unknown canonical id', async () => {
    const res = await request(buildApp(KEY_USER))
      .get(`/api/v2/gov-opportunities/op:gov:${'f'.repeat(32)}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('not_found');
  });

  it('200 and a conforming object for a known id', async () => {
    const id = canonicalIdFor(rowVerified().id);
    const res = await request(buildApp(KEY_USER)).get(`/api/v2/gov-opportunities/${id}`);
    expect(res.status).toBe(200);
    assertValid(res.body.data, 'detail');
    expect(res.body.data.canonicalOpportunityId).toBe(id);
  });

  it('an empty snapshot list says "none recorded", not "nothing happened"', async () => {
    const id = canonicalIdFor(rowVerified().id);
    const res = await request(buildApp(KEY_USER)).get(`/api/v2/gov-opportunities/${id}/snapshots`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.note).toMatch(/means none were written/i);
  });
});

describe('v1 compatibility', () => {
  it('v2 lives on a separate path and does not touch the v1 bonfire router', () => {
    // NOTE on branch topology: this branch descends from main, not from
    // feat/accelerator-bonfire-read-integration, so the accelerator's
    // /best-fit route is deliberately absent here. Asserting its presence
    // would couple this suite to a sibling branch.
    const src = fs.readFileSync(path.join(__dirname, '../../src/bonfire/bonfire.routes.js'), 'utf8');
    expect(src).toContain("router.get('/opportunities'");
    expect(src).toContain("router.get('/opportunities/:id'");
    // The v1 router knows nothing about v2.
    expect(src).not.toContain('gov-opportunities');
    expect(src).not.toContain('govOpportunity');
  });

  it('the v2 router never mutates: no create/update/destroy calls in the read path', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/govContracts/govOpportunityV2.service.js'), 'utf8');
    expect(src).not.toMatch(/\.create\(|\.update\(|\.destroy\(|findOrCreate/);
  });

  it('exposes only GET verbs', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/govContracts/govOpportunityV2.routes.js'), 'utf8');
    expect(src).not.toMatch(/router\.(post|put|patch|delete)\(/);
  });
});

// ---------------------------------------------------------------------------
// Release-readiness: a record WITH a persisted identity must still validate.
//
// Every other schema assertion here runs against `{}` identity — no aliases —
// so the alias enum was never exercised. The writer keys its primary alias on
// `bonfire_opportunity_id`, which is NOT a member of v1's frozen
// sourceAliases[].idType enum, so the first record to gain a persisted identity
// would have emitted a payload that fails its own pinned contract.
// ---------------------------------------------------------------------------
describe('mapper — persisted aliases project onto the frozen v1 enum', () => {
  const ALIAS_ENUM = SCHEMA.properties.sourceAliases.items.properties.idType.enum;
  const at = '2026-09-29T18:00:00.000Z';
  const identityWith = (aliases) => ({
    canonicalPublicId: 'op:gov:04e92dfec7a6939d7b2f65a2c267abb8',
    sourceSnapshotVersion: 1,
    aliases,
  });

  it('a payload carrying the WRITER-minted aliases validates', () => {
    const { envelope } = toGovOpportunityV1(rowVerified(), identityWith([
      { idType: 'bonfire_opportunity_id', idValue: 'row-1', observedAt: at, note: 'Primary alias minted at first ingestion.' },
      { idType: 'portal_url', idValue: 'https://utah.bonfirehub.com/opportunities/1', observedAt: at, note: null },
    ]));
    assertValid(envelope, 'persisted-aliases');
    expect(envelope.sourceAliases.map((a) => a.idType)).toEqual(['legacy_row_id', 'portal_url']);
  });

  it('the internal type is retained in diagnostics, outside the contract', () => {
    const { envelope, diagnostics } = toGovOpportunityV1(rowVerified(), identityWith([
      { idType: 'bonfire_opportunity_id', idValue: 'row-1', observedAt: at },
    ]));
    expect(diagnostics.internalAliasTypes).toEqual(['bonfire_opportunity_id']);
    // and it does NOT leak into the contract object
    expect(JSON.stringify(envelope)).not.toContain('bonfire_opportunity_id');
  });

  it('an UNRECOGNISED internal type becomes `other`, never a raw token', () => {
    const { envelope } = toGovOpportunityV1(rowVerified(), identityWith([
      { idType: 'some_future_internal_key', idValue: 'x', observedAt: at },
    ]));
    expect(envelope.sourceAliases[0].idType).toBe('other');
    assertValid(envelope, 'unknown-alias-type');
  });

  it('every projected value is a member of the schema enum, for every input we mint', () => {
    // Guards the mapping table against drifting away from the writer.
    // eslint-disable-next-line global-require
    const { ALIAS_PRIMARY } = require('../../src/govContracts/govIngestion.service');
    for (const internal of [ALIAS_PRIMARY, 'portal_url', 'source_record_id', 'external_id', 'legacy_row_id', 'nonsense']) {
      const { envelope } = toGovOpportunityV1(rowVerified(), identityWith([
        { idType: internal, idValue: 'x', observedAt: at },
      ]));
      expect(ALIAS_ENUM).toContain(envelope.sourceAliases[0].idType);
    }
  });
});
