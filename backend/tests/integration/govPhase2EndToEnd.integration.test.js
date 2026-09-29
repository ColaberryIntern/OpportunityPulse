/**
 * Phase 2 end-to-end: ingestion writer -> real Postgres -> HTTP API.
 *
 * Skipped unless PHASE2_TEST_DB_URL is set.
 *
 * This is the demonstration the coordinator asked for, in order:
 *   ingest source -> persist identity/evidence/snapshot -> list -> detail by the
 *   RETURNED id -> retrieve the EXACT snapshot -> changed observation -> new
 *   version -> unresolved conflict withheld from verified results.
 *
 * It deliberately uses the real models against a real engine. Helper-level
 * assertions passed for both reproduced defects; they only showed up once a row
 * was written and read back, so the sequence has to cross the database.
 *
 * Schema is created with model sync() plus the snapshot-immutability trigger.
 * Migration up/down correctness is proven separately in
 * govPhase2Migration.integration.test.js.
 */

const { Sequelize } = require('sequelize');
const express = require('express');
const request = require('supertest');

const URL = process.env.PHASE2_TEST_DB_URL;
const d = URL ? describe : describe.skip;

// Resolved at property-access time, so the router picks up the live test models.
jest.mock('../../src/models', () => new Proxy({}, {
  get: (_t, prop) => (global.__TEST_MODELS__ || {})[prop],
}));
jest.mock('../../src/middleware/auth.middleware', () => ({
  verifyToken: (req, res, next) => next(),
  verifyTokenOrApiKey: (req, res, next) => {
    if (!req.user) return res.status(401).json({ status: 'error', message: 'unauthenticated', code: 401 });
    return next();
  },
}));

const { ingestObservation } = require('../../src/govContracts/govIngestion.service');
const v2Router = require('../../src/govContracts/govOpportunityV2.routes');

const SCOPED = { userId: 1, scopes: ['read:gov_opportunities'], apiKey: true };
const PROV = { source: 'portal_scrape', basis: 'single_authoritative_source' };

const parseOf = (utc, text = 'Oct 15th 2026, 2:00 PM MDT') => ({
  originalText: text,
  timezoneLabel: 'MDT',
  timezoneSource: 'abbreviation',
  offsetMinutes: -360,
  utc,
  confidence: 'high',
  uncertainty: null,
  candidates: null,
});

d('Phase 2 end-to-end: ingest -> persist -> API', () => {
  let sequelize;
  let models;
  let app;
  const OPP = '11111111-1111-4111-8111-111111111111';
  const OPP2 = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    sequelize = new Sequelize(URL, { logging: false });
    models = {
      sequelize,
      BonfireOpportunity: require('../../src/models/BonfireOpportunity')(sequelize),
      BonfireOpportunityTag: require('../../src/models/BonfireOpportunityTag')(sequelize),
      GovCanonicalOpportunity: require('../../src/models/GovCanonicalOpportunity')(sequelize),
      GovSourceAlias: require('../../src/models/GovSourceAlias')(sequelize),
      GovSourceSnapshot: require('../../src/models/GovSourceSnapshot')(sequelize),
    };
    await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await models.BonfireOpportunity.sync({ force: true });
    await models.GovCanonicalOpportunity.sync({ force: true });
    await models.GovSourceAlias.sync({ force: true });
    await models.GovSourceSnapshot.sync({ force: true });
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION gov_source_snapshots_immutable() RETURNS TRIGGER AS $$
      BEGIN RAISE EXCEPTION 'gov_source_snapshots is append-only'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_gov_source_snapshots_immutable
      BEFORE UPDATE OR DELETE ON gov_source_snapshots
      FOR EACH ROW EXECUTE FUNCTION gov_source_snapshots_immutable();
    `);

    await models.BonfireOpportunity.bulkCreate([
      { id: OPP, title: 'AI Analytics Platform', agency: 'State of Utah (U3P)', sourceUrl: 'https://utah.bonfirehub.com/opportunities/1', externalId: 'bonfire:agency:utah:R-1' },
      { id: OPP2, title: 'Conflicted Deadline Bid', agency: 'State of Utah (U3P)', externalId: 'bonfire:agency:utah:R-2' },
    ]);

    global.__TEST_MODELS__ = models;
    app = express();
    app.use((req, _res, next) => { req.user = SCOPED; next(); });
    app.use('/api/v2/gov-opportunities', v2Router);
  }, 120000);

  afterAll(async () => { if (sequelize) await sequelize.close(); });

  // -------------------------------------------------------------- step 1
  let publicId;
  let firstVersion;

  it('1. ingest a source observation: persists identity, alias, snapshot and evidence', async () => {
    const out = await ingestObservation({
      opportunityId: OPP,
      sourceSystem: 'bonfire',
      aliases: [{ idType: 'portal_url', idValue: 'https://utah.bonfirehub.com/opportunities/1' }],
      sourceFacts: {
        deadlineText: 'Oct 15th 2026, 2:00 PM MDT',
        title: 'AI Analytics Platform',
        agency: 'State of Utah (U3P)',
        sourceUrl: 'https://utah.bonfirehub.com/opportunities/1',
        externalId: 'bonfire:agency:utah:R-1',
      },
      fetch: { status: 'success', attemptedAt: new Date() },
      parse: parseOf('2026-10-15T20:00:00.000Z'),
      rawPresent: true,
      provenance: PROV,
    }, { models, sequelize });

    expect(out.applied).toBe(true);
    expect(out.identityCreated).toBe(true);
    expect(out.snapshotWritten).toBe(true);
    expect(out.sourceSnapshotVersion).toBe(1);
    expect(out.decision.verified).toBe(true);

    publicId = out.canonicalPublicId;
    firstVersion = out.sourceSnapshotVersion;
    expect(publicId).toMatch(/^op:gov:[0-9a-f]{32}$/);

    // identity + aliases really landed
    const aliases = await models.GovSourceAlias.findAll({ where: { canonicalId: out.canonicalId } });
    expect(aliases.map((a) => a.idType).sort()).toEqual(['bonfire_opportunity_id', 'portal_url']);

    // evidence really landed on the row
    const row = await models.BonfireOpportunity.findByPk(OPP);
    expect(row.closeDate.toISOString()).toBe('2026-10-15T20:00:00.000Z');
    expect(row.closeDateVerifiedAt).not.toBeNull();
    expect(row.closeDateVerificationBasis).toBe('single_authoritative_source');
    expect(row.closeDateObservationOutcome).toBe('parsed');
  }, 60000);

  // -------------------------------------------------------------- step 2
  it('2. list returns it in the verified bucket', async () => {
    const res = await request(app).get('/api/v2/gov-opportunities?deadlineState=verified&limit=50');
    expect(res.status).toBe(200);
    const found = res.body.data.find((x) => x.canonicalOpportunityId === publicId);
    expect(found).toBeDefined();
    expect(found.deadline.utc).toBe('2026-10-15T20:00:00.000Z');
    expect(found.deadline.utcConfidence).toBe('high');
  });

  // -------------------------------------------------------------- step 3
  it('3. the id returned by list resolves through detail (via the persisted alias)', async () => {
    const res = await request(app).get(`/api/v2/gov-opportunities/${publicId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canonicalOpportunityId).toBe(publicId);
    expect(res.body.meta.sourceSnapshotVersion).toBe(1);
    // aliases are exposed, so a consumer can reconcile its own earlier records
    expect(res.body.data.sourceAliases.map((a) => a.idType)).toEqual(
      expect.arrayContaining(['bonfire_opportunity_id', 'portal_url']),
    );
  });

  // -------------------------------------------------------------- step 4
  it('4. the EXACT snapshot version is retrievable, with its immutable payload', async () => {
    const res = await request(app).get(`/api/v2/gov-opportunities/${publicId}?snapshotVersion=${firstVersion}`);
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.payload.sourceFacts.deadlineText).toBe('Oct 15th 2026, 2:00 PM MDT');
    expect(res.body.meta.retrieval).toBe('exact_snapshot_version');
  });

  it('4b. a non-existent version is a 404 naming the versions that DO exist', async () => {
    const res = await request(app).get(`/api/v2/gov-opportunities/${publicId}?snapshotVersion=99`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('snapshot_not_found');
    expect(res.body.availableVersions).toEqual([1]);
  });

  // -------------------------------------------------------------- step 5
  it('5. an UNCHANGED re-observation writes no snapshot and does not advance the version', async () => {
    const out = await ingestObservation({
      opportunityId: OPP,
      sourceFacts: {
        deadlineText: 'Oct 15th 2026, 2:00 PM MDT',
        title: 'AI Analytics Platform',
        agency: 'State of Utah (U3P)',
        sourceUrl: 'https://utah.bonfirehub.com/opportunities/1',
        externalId: 'bonfire:agency:utah:R-1',
      },
      fetch: { status: 'success', attemptedAt: new Date() },
      parse: parseOf('2026-10-15T20:00:00.000Z'),
      rawPresent: true,
      provenance: PROV,
    }, { models, sequelize });

    expect(out.snapshotWritten).toBe(false);
    expect(out.sourceSnapshotVersion).toBe(1); // unchanged
    const snaps = await models.GovSourceSnapshot.count({ where: { canonicalId: out.canonicalId } });
    expect(snaps).toBe(1);
  }, 60000);

  it('5b. an ENRICHMENT-only change cannot advance a source version', async () => {
    // Scores/categories are not source facts and do not feed the content hash.
    await models.BonfireOpportunity.update(
      { fitScore: 91, priorityScore: 88, aiCategory: 'Data & Analytics' },
      { where: { id: OPP } },
    );
    const out = await ingestObservation({
      opportunityId: OPP,
      sourceFacts: {
        deadlineText: 'Oct 15th 2026, 2:00 PM MDT',
        title: 'AI Analytics Platform',
        agency: 'State of Utah (U3P)',
        sourceUrl: 'https://utah.bonfirehub.com/opportunities/1',
        externalId: 'bonfire:agency:utah:R-1',
      },
      fetch: { status: 'success', attemptedAt: new Date() },
      parse: parseOf('2026-10-15T20:00:00.000Z'),
      rawPresent: true,
      provenance: PROV,
    }, { models, sequelize });
    expect(out.snapshotWritten).toBe(false);
    expect(out.sourceSnapshotVersion).toBe(1);
  }, 60000);

  // -------------------------------------------------------------- step 6
  it('6. a CHANGED source observation writes a new snapshot and advances the version', async () => {
    const out = await ingestObservation({
      opportunityId: OPP,
      sourceFacts: {
        deadlineText: 'Oct 22nd 2026, 2:00 PM MDT', // buyer moved the deadline
        title: 'AI Analytics Platform',
        agency: 'State of Utah (U3P)',
        sourceUrl: 'https://utah.bonfirehub.com/opportunities/1',
        externalId: 'bonfire:agency:utah:R-1',
      },
      fetch: { status: 'success', attemptedAt: new Date() },
      parse: parseOf('2026-10-22T20:00:00.000Z', 'Oct 22nd 2026, 2:00 PM MDT'),
      rawPresent: true,
      provenance: PROV,
    }, { models, sequelize });

    expect(out.snapshotWritten).toBe(true);
    expect(out.sourceSnapshotVersion).toBe(2);
    expect(out.decision.verified).toBe(true);
    expect(out.decision.publishedDeadlineChanged).toBe(true);

    const row = await models.BonfireOpportunity.findByPk(OPP);
    expect(row.closeDate.toISOString()).toBe('2026-10-22T20:00:00.000Z');
    // the displaced value is retained as auditable history, not lost
    expect(row.closeDateSuperseded).toHaveLength(1);
    expect(row.closeDateSuperseded[0].utc).toBe('2026-10-15T20:00:00.000Z');
  }, 60000);

  it('6b. both snapshot versions remain individually retrievable and immutable', async () => {
    const v1 = await request(app).get(`/api/v2/gov-opportunities/${publicId}?snapshotVersion=1`);
    const v2 = await request(app).get(`/api/v2/gov-opportunities/${publicId}?snapshotVersion=2`);
    expect(v1.body.data.payload.sourceFacts.deadlineText).toBe('Oct 15th 2026, 2:00 PM MDT');
    expect(v2.body.data.payload.sourceFacts.deadlineText).toBe('Oct 22nd 2026, 2:00 PM MDT');
    expect(v1.body.data.contentHash).not.toBe(v2.body.data.contentHash);

    await expect(
      sequelize.query("UPDATE gov_source_snapshots SET content_hash = 'tampered'"),
    ).rejects.toThrow(/append-only/i);
  });

  // -------------------------------------------------------------- step 7
  it('7. an UNRESOLVED CONFLICT is withheld from verified results', async () => {
    const out = await ingestObservation({
      opportunityId: OPP,
      sourceFacts: {
        deadlineText: 'Oct 22nd 2026, 2:00 PM MDT',
        title: 'AI Analytics Platform',
        agency: 'State of Utah (U3P)',
        sourceUrl: 'https://utah.bonfirehub.com/opportunities/1',
        externalId: 'bonfire:agency:utah:R-1',
        conflictProbe: true, // changes the hash so a snapshot is written
      },
      fetch: { status: 'success', attemptedAt: new Date() },
      // Parses cleanly to the CURRENT value, but the source also offers another
      // instant. This is defect A: it used to read back as verified.
      parse: parseOf('2026-10-22T20:00:00.000Z', 'Oct 22nd 2026, 2:00 PM MDT'),
      rawPresent: true,
      candidates: [
        { utc: '2026-10-22T20:00:00.000Z', source: 'portal', originalText: 'Oct 22nd 2026, 2:00 PM MDT' },
        { utc: '2026-10-23T20:00:00.000Z', source: 'addendum', originalText: 'Oct 23rd 2026, 2:00 PM MDT' },
      ],
      provenance: PROV,
    }, { models, sequelize });
    expect(out.decision.verified).toBe(false);
    expect(out.decision.outcome).toBe('conflict');

    // The stored value is untouched...
    const row = await models.BonfireOpportunity.findByPk(OPP);
    expect(row.closeDate.toISOString()).toBe('2026-10-22T20:00:00.000Z');

    // ...but it is NO LONGER returned as verified.
    const verified = await request(app).get('/api/v2/gov-opportunities?deadlineState=verified&limit=50');
    expect(verified.body.data.find((x) => x.canonicalOpportunityId === publicId)).toBeUndefined();

    // It surfaces in the retained bucket instead, with the value visible.
    const retained = await request(app).get('/api/v2/gov-opportunities?deadlineState=retained_unverified&limit=50');
    const found = retained.body.data.find((x) => x.canonicalOpportunityId === publicId);
    expect(found).toBeDefined();
    expect(found.deadline.utc).toBeNull();
    expect(found.deadline.conflicts).toHaveLength(2);

    const dg = retained.body.diagnostics.find((x) => x.canonicalOpportunityId === publicId);
    expect(dg.effectiveState).toBe('retained_unverified');
    expect(dg.retainedUnverifiedUtc).toBe('2026-10-22T20:00:00.000Z');
    expect(dg.supersededBy).toBe('conflict');
  }, 60000);

  // -------------------------------------------------------------- consistency
  it('8. SQL buckets and the mapper agree row-for-row', async () => {
    const { readDeadlineState } = require('../../src/bonfire/deadlineEvidence.service');
    const verified = await request(app).get('/api/v2/gov-opportunities?deadlineState=verified&limit=100');
    for (const item of verified.body.data) {
      expect(item.deadline.utc).not.toBeNull();
      expect(item.deadline.utcConfidence).toBe('high');
    }
    // and every row the mapper calls verified is actually in that bucket
    const all = await models.BonfireOpportunity.findAll();
    const mapperVerified = all
      .map((r) => r.get({ plain: true }))
      .filter((r) => readDeadlineState(r).isVerified).length;
    expect(verified.body.data.length).toBe(mapperVerified);
  }, 60000);

  it('9. a failed fetch keeps the source outage visible even when the page is empty', async () => {
    await ingestObservation({
      opportunityId: OPP2,
      sourceFacts: { deadlineText: null, title: 'Conflicted Deadline Bid' },
      fetch: { status: 'failed', attemptedAt: new Date(), error: 'HTTP 403' },
      provenance: PROV,
    }, { models, sequelize });

    // A bucket that matches nothing still reports corpus-wide source health.
    const empty = await request(app).get('/api/v2/gov-opportunities?deadlineState=not_published&limit=50');
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.meta.sourceAvailability[0].status).toBe('degraded');
    expect(empty.body.meta.sourceAvailability[0].affectedRecords).toBeGreaterThan(0);
  }, 60000);

  it('10. unsupported query parameters are rejected, not ignored', async () => {
    const res = await request(app).get('/api/v2/gov-opportunities?bogusFilter=1&limit=5');
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('unsupported_parameter');
    expect(res.body.unsupportedParameters).toEqual(['bogusFilter']);
  });
});
