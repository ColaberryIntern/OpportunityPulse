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
// Verification requires an EVIDENCED authority that can speak for the buyer, so
// the fixture carries the classification and the evidence for it, not a label.
const PROV = {
  source: 'portal_scrape',
  basis: 'single_authoritative_source',
  authority: 'publisher_of_record',
  authorityEvidence: 'Portal host "utah.bonfirehub.com" matches the ingest namespace "utah".',
  sourceRef: 'https://utah.bonfirehub.com/opportunities/1',
};

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
    // sync() does not create this: the model documents that the unique index on
    // external_id lives in a migration (20260425000002). upsertJsonArray relies
    // on it as the ON CONFLICT target, so without it the scraper path fails here
    // for a reason that would never occur in production.
    await sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_bonfire_opps_external_id ON bonfire_opportunities (external_id);',
    );

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

  // =========================================================================
  // 11. THE REAL INGESTION PATH.
  //
  // Everything above drives ingestObservation directly. That is not enough:
  // "tables and standalone helpers without callers do not satisfy this
  // requirement". This exercises the path the SCRAPER actually takes —
  // normalize() output -> bonfire.service.upsertJsonArray -> evidence — so the
  // wiring itself is under test, not just the helper.
  // =========================================================================
  describe('11. the scraper path records evidence', () => {
    // Required lazily so the module-level destructure of ../models resolves
    // AFTER global.__TEST_MODELS__ is populated by beforeAll.
    let bonfireService;
    let normalize;
    let parseHtml;

    const SCRAPED_REF = 'E2E-100';
    let scrapedExternalId;

    beforeAll(() => {
      // eslint-disable-next-line global-require
      bonfireService = require('../../src/bonfire/bonfire.service');
      // eslint-disable-next-line global-require
      normalize = require('../../src/bonfire/scraper/normalize');
      // eslint-disable-next-line global-require
      ({ parseHtml } = require('../../src/bonfire/scraper/pages/agencyOpportunities'));
    });

    const scrapeRows = (closeCell) => {
      const html = `
        <table class="dataTable">
          <thead><tr><th>Status</th><th>Ref. #</th><th>Project</th><th>Close Date</th><th>Days Left</th><th>Action</th></tr></thead>
          <tbody><tr>
            <td>Open</td><td>${SCRAPED_REF}</td><td>Scraped Data Platform</td>
            <td>${closeCell}</td><td>20</td><td><a href="/opportunities/900">x</a></td>
          </tr></tbody>
        </table>`;
      return parseHtml(html).map((r) => normalize.fromAgencyOpportunity(r, 'utah', { agencyName: 'Utah' }));
    };

    it('upsertJsonArray persists identity, alias, snapshot and a VERIFIED deadline', async () => {
      const rows = scrapeRows('Oct 15th 2026, 2:00 PM MDT');
      scrapedExternalId = rows[0].external_id;
      // provenance really did survive normalize()
      expect(rows[0].close_date_raw).toBe('Oct 15th 2026, 2:00 PM MDT');

      const out = await bonfireService.upsertJsonArray(rows);
      expect(out.evidence.recorded).toBe(1);
      expect(out.evidence.snapshotsWritten).toBe(1);
      expect(out.evidence.verified).toBe(1);
      expect(out.evidence.failed).toBe(0);

      const row = await models.BonfireOpportunity.findOne({ where: { externalId: scrapedExternalId } });
      expect(row.closeDate.toISOString()).toBe('2026-10-15T20:00:00.000Z');
      expect(row.closeDateVerifiedAt).not.toBeNull();
      expect(row.closeDateVerifiedSource).toBe('bonfire_portal_scrape');
      // The basis is now the DETERMINED authority, with the comparison that
      // established it stored alongside — not a hardcoded assertion.
      expect(row.closeDateVerificationBasis).toBe('publisher_of_record');
      expect(row.closeDateAuthority).toBe('publisher_of_record');
      expect(row.closeDateAuthorityEvidence).toMatch(/utah\.bonfirehub\.com/);
      expect(row.closeDateObservationOutcome).toBe('parsed');

      const alias = await models.GovSourceAlias.findOne({
        where: { idType: 'bonfire_opportunity_id', idValue: String(row.id) },
      });
      expect(alias).not.toBeNull();
      const canonical = await models.GovCanonicalOpportunity.findByPk(alias.canonicalId);
      expect(canonical.sourceSnapshotVersion).toBe(1);
    }, 60000);

    it('and the scraped row is reachable through list -> detail by its returned id', async () => {
      const row = await models.BonfireOpportunity.findOne({ where: { externalId: scrapedExternalId } });
      const alias = await models.GovSourceAlias.findOne({
        where: { idType: 'bonfire_opportunity_id', idValue: String(row.id) },
      });
      const canonical = await models.GovCanonicalOpportunity.findByPk(alias.canonicalId);

      const list = await request(app).get('/api/v2/gov-opportunities?deadlineState=verified&limit=100');
      const item = list.body.data.find((x) => x.canonicalOpportunityId === canonical.canonicalPublicId);
      expect(item).toBeDefined();

      const detail = await request(app).get(`/api/v2/gov-opportunities/${item.canonicalOpportunityId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.canonicalOpportunityId).toBe(item.canonicalOpportunityId);
      expect(detail.body.data.sourceAliases.map((a) => a.idType)).toContain('portal_url');
    }, 60000);

    it('re-scraping unchanged source writes no new snapshot', async () => {
      const out = await bonfireService.upsertJsonArray(scrapeRows('Oct 15th 2026, 2:00 PM MDT'));
      expect(out.evidence.recorded).toBe(1);
      expect(out.evidence.snapshotsWritten).toBe(0); // unchanged
    }, 60000);

    it('a scraped cell with no timezone does NOT verify, and does not erase the stored deadline', async () => {
      const out = await bonfireService.upsertJsonArray(scrapeRows('Oct 22nd 2026, 2:00 PM'));
      expect(out.evidence.recorded).toBe(1);
      expect(out.evidence.verified).toBe(0);

      const row = await models.BonfireOpportunity.findOne({ where: { externalId: scrapedExternalId } });
      // stored value retained, but no longer published
      expect(row.closeDate.toISOString()).toBe('2026-10-15T20:00:00.000Z');
      expect(row.closeDateObservationOutcome).toBe('unparsed');
      expect(row.closeDateUncertainty).toBe('missing_timezone');
    }, 60000);

    it('evidence recording is non-fatal and never aborts a scrape', async () => {
      // A row with no external_id cannot be resolved; it must be skipped, not throw.
      const out = await bonfireService.upsertJsonArray([
        { title: 'No external id', close_date_raw: 'Oct 15th 2026, 2:00 PM MDT' },
      ]);
      expect(out.evidence.failed).toBe(0);
      expect(out.evidence.skipped).toBeGreaterThan(0);
    }, 60000);
  });

  // =========================================================================
  // 12. Bucket membership is consistent and documented across ALL buckets,
  // not only `verified`. Every row must land in exactly one of the disjoint
  // buckets, and each bucket must agree with the mapper's state.
  // =========================================================================
  describe('12. bucket membership is consistent across every bucket', () => {
    const { readDeadlineState } = require('../../src/bonfire/deadlineEvidence.service');
    const DISJOINT = ['verified', 'legacy_unverified', 'retained_unverified', 'unknown'];

    const idsIn = async (bucket) => {
      const res = await request(app).get(`/api/v2/gov-opportunities?deadlineState=${bucket}&limit=100`);
      expect(res.status).toBe(200);
      return res.body.data.map((x) => x.canonicalOpportunityId);
    };

    it('verified-only never returns a retained or unresolved record', async () => {
      const res = await request(app).get('/api/v2/gov-opportunities?deadlineState=verified&limit=100');
      for (const item of res.body.data) {
        expect(item.deadline.utc).not.toBeNull();
        expect(item.deadline.utcConfidence).toBe('high');
      }
      const dgs = res.body.diagnostics.map((d) => d.effectiveState);
      expect(dgs.every((s) => s === 'verified')).toBe(true);
      expect(dgs).not.toContain('retained_unverified');
      expect(dgs).not.toContain('legacy_unverified');
    });

    it('the four primary buckets are mutually disjoint', async () => {
      const sets = {};
      for (const b of DISJOINT) sets[b] = await idsIn(b); // eslint-disable-line no-await-in-loop
      for (let i = 0; i < DISJOINT.length; i += 1) {
        for (let j = i + 1; j < DISJOINT.length; j += 1) {
          const overlap = sets[DISJOINT[i]].filter((id) => sets[DISJOINT[j]].includes(id));
          expect({ pair: `${DISJOINT[i]}/${DISJOINT[j]}`, overlap }).toEqual({
            pair: `${DISJOINT[i]}/${DISJOINT[j]}`, overlap: [],
          });
        }
      }
    }, 60000);

    it('the four primary buckets together cover every record', async () => {
      const all = await idsIn('all');
      const covered = new Set();
      for (const b of DISJOINT) {
        // eslint-disable-next-line no-await-in-loop
        (await idsIn(b)).forEach((id) => covered.add(id));
      }
      expect([...all].filter((id) => !covered.has(id))).toEqual([]);
    }, 60000);

    it('`unverified` is exactly the union of the three non-verified buckets', async () => {
      const unverified = new Set(await idsIn('unverified'));
      const union = new Set();
      for (const b of ['legacy_unverified', 'retained_unverified', 'unknown']) {
        // eslint-disable-next-line no-await-in-loop
        (await idsIn(b)).forEach((id) => union.add(id));
      }
      expect([...unverified].sort()).toEqual([...union].sort());
    }, 60000);

    it('`not_published` contains only AFFIRMED absences', async () => {
      const res = await request(app).get('/api/v2/gov-opportunities?deadlineState=not_published&limit=100');
      for (const d of res.body.diagnostics) {
        expect(d.observationOutcome).toBe('absent_confirmed');
      }
      // capture_unknown must never appear here — that is defect B.
      expect(res.body.diagnostics.map((d) => d.observationOutcome)).not.toContain('capture_unknown');
    });

    it('every bucket agrees row-for-row with the mapper state', async () => {
      const rows = (await models.BonfireOpportunity.findAll()).map((r) => r.get({ plain: true }));
      const expected = {
        verified: rows.filter((r) => readDeadlineState(r).state === 'verified').length,
        legacy_unverified: rows.filter((r) => readDeadlineState(r).state === 'legacy_unverified').length,
        retained_unverified: rows.filter((r) => readDeadlineState(r).state === 'retained_unverified').length,
        unknown: rows.filter((r) => readDeadlineState(r).state === 'unknown').length,
        not_published: rows.filter((r) => readDeadlineState(r).state === 'not_published').length,
      };
      for (const [bucket, count] of Object.entries(expected)) {
        // eslint-disable-next-line no-await-in-loop
        const got = (await idsIn(bucket)).length;
        expect({ bucket, got }).toEqual({ bucket, got: count });
      }
    }, 60000);
  });

  // =========================================================================
  // 13. Issue 1: a source update and its evidence publish together, or not at all.
  //
  // Before this, the bulk upsert wrote close_date in one transaction and the
  // evidence write moved the observation state in another. Two wrong answers
  // followed, and both are reproduced here as failures of the old split:
  //   * an evidence failure left a CHANGED close_date beside an untouched
  //     verified_at + observation id, so a deadline nobody verified read back
  //     as verified;
  //   * on success the evidence write read the ALREADY-OVERWRITTEN close_date,
  //     so the superseded-history entry recorded the NEW value as the old one.
  // =========================================================================
  describe('13. source changes and evidence publish atomically', () => {
    let bonfireService;
    const EXT = 'bonfire:agency:utah:TX-1';

    beforeAll(() => {
      // eslint-disable-next-line global-require
      bonfireService = require('../../src/bonfire/bonfire.service');
    });

    const row = (over = {}) => ({
      external_id: EXT,
      title: 'Transactional Row A',
      agency: 'Utah',
      source_url: 'https://utah.bonfirehub.com/opportunities/1001',
      close_date: '2026-10-15T20:00:00.000Z',
      close_date_raw: 'Oct 15th 2026, 2:00 PM MDT',
      ...over,
    });

    const find = (externalId = EXT) => models.BonfireOpportunity.findOne({ where: { externalId } });
    const versionOf = async (externalId = EXT) => {
      const r = await find(externalId);
      const alias = await models.GovSourceAlias.findOne({
        where: { idType: 'bonfire_opportunity_id', idValue: String(r.id) },
      });
      if (!alias) return null;
      const c = await models.GovCanonicalOpportunity.findByPk(alias.canonicalId);
      return c.sourceSnapshotVersion;
    };

    let verifiedAtA;
    let observationIdA;

    it('publishes the source columns and the verified deadline together', async () => {
      const out = await bonfireService.upsertJsonArray([row()]);
      expect(out.evidence.verified).toBe(1);
      expect(out.evidence.failed).toBe(0);

      const r = await find();
      expect(r.title).toBe('Transactional Row A');
      expect(r.closeDate.toISOString()).toBe('2026-10-15T20:00:00.000Z');
      expect(r.closeDateVerifiedAt).not.toBeNull();
      expect(r.closeDateVerifiedObservationId).toBe(r.closeDateLastObservationId);
      expect(await versionOf()).toBe(1);

      verifiedAtA = r.closeDateVerifiedAt.toISOString();
      observationIdA = r.closeDateVerifiedObservationId;
    }, 60000);

    it('a FAILED evidence write leaves the row wholly at its previous state', async () => {
      const spy = jest.spyOn(models.GovSourceSnapshot, 'create')
        .mockRejectedValueOnce(new Error('forced snapshot failure'));

      const out = await bonfireService.upsertJsonArray([row({
        title: 'Transactional Row B',
        close_date: '2026-11-01T20:00:00.000Z',
        close_date_raw: 'Nov 1st 2026, 2:00 PM MDT',
      })]);
      spy.mockRestore();

      expect(out.evidence.failed).toBe(1);
      expect(out.evidence.recorded).toBe(0);

      const r = await find();
      // NEITHER half landed. The old split applied the title and the deadline
      // here and only the evidence rolled back.
      expect(r.title).toBe('Transactional Row A');
      expect(r.closeDate.toISOString()).toBe('2026-10-15T20:00:00.000Z');
      expect(r.closeDateVerifiedAt.toISOString()).toBe(verifiedAtA);
      expect(r.closeDateVerifiedObservationId).toBe(observationIdA);
      expect(r.closeDateLastObservationId).toBe(observationIdA);
      expect(await versionOf()).toBe(1);
    }, 60000);

    it('and the row still reads as VERIFIED, because nothing invalidated it', async () => {
      // eslint-disable-next-line global-require
      const { readDeadlineState } = require('../../src/bonfire/deadlineEvidence.service');
      const r = await find();
      expect(readDeadlineState(r.get({ plain: true })).state).toBe('verified');

      // Same answer through the API, which decides the bucket in SQL.
      const list = await request(app).get('/api/v2/gov-opportunities?deadlineState=verified&limit=200');
      const alias = await models.GovSourceAlias.findOne({
        where: { idType: 'bonfire_opportunity_id', idValue: String(r.id) },
      });
      const canonical = await models.GovCanonicalOpportunity.findByPk(alias.canonicalId);
      expect(list.body.data.map((x) => x.canonicalOpportunityId))
        .toContain(canonical.canonicalPublicId);
    }, 60000);

    it('then a successful re-scrape publishes both halves and supersedes the REAL old value', async () => {
      const out = await bonfireService.upsertJsonArray([row({
        title: 'Transactional Row B',
        close_date: '2026-11-01T20:00:00.000Z',
        close_date_raw: 'Nov 1st 2026, 2:00 PM MDT',
      })]);
      expect(out.evidence.verified).toBe(1);
      expect(out.evidence.snapshotsWritten).toBe(1);

      const r = await find();
      expect(r.title).toBe('Transactional Row B');
      expect(r.closeDate.toISOString()).toBe('2026-11-01T20:00:00.000Z');
      expect(await versionOf()).toBe(2);

      // The displaced value is the one the row ACTUALLY held. Under the old
      // split the bulk upsert had already written the new value, so history
      // recorded 2026-11-01 as the value it replaced.
      expect(r.closeDateSuperseded).toHaveLength(1);
      expect(r.closeDateSuperseded[0].utc).toBe('2026-10-15T20:00:00.000Z');
      expect(r.closeDateSuperseded[0].verifiedAt).toBe(verifiedAtA);
    }, 60000);

    it('a REJECTED raw input cannot touch evidence for an existing row', async () => {
      const beforeVersion = await versionOf();

      // Same external_id, but no title: validateRow refuses it. It used to
      // reach recordGovEvidence anyway, because the ENTIRE raw array was
      // passed, so a row the validator had refused could still mint a snapshot
      // and move the deadline state of a row that does exist.
      const out = await bonfireService.upsertJsonArray([
        { external_id: EXT, title: '', close_date_raw: 'Dec 1st 2026, 2:00 PM MDT' },
      ]);
      expect(out.errors).toHaveLength(1);
      expect(out.processed).toBe(0);
      expect(out.evidence.recorded).toBe(0);
      expect(out.evidence.snapshotsWritten).toBe(0);

      const r = await find();
      expect(r.title).toBe('Transactional Row B');
      expect(r.closeDate.toISOString()).toBe('2026-11-01T20:00:00.000Z');
      expect(await versionOf()).toBe(beforeVersion);
    }, 60000);

    it('one failing row does not stop the rest of the batch', async () => {
      const EXT2 = 'bonfire:agency:utah:TX-2';
      const EXT3 = 'bonfire:agency:utah:TX-3';
      const spy = jest.spyOn(models.GovSourceSnapshot, 'create')
        .mockImplementationOnce(() => Promise.reject(new Error('forced failure, first row only')));

      const out = await bonfireService.upsertJsonArray([
        row({ external_id: EXT2, title: 'Batch Row 1', source_url: 'https://utah.bonfirehub.com/opportunities/1002' }),
        row({ external_id: EXT3, title: 'Batch Row 2', source_url: 'https://utah.bonfirehub.com/opportunities/1003' }),
      ]);
      spy.mockRestore();

      expect(out.evidence.failed).toBe(1);
      expect(out.evidence.recorded).toBe(1);

      // The failed row exists (the insert is what made it addressable) but
      // carries no verification and no identity — it is not published as
      // verified on the strength of a write that rolled back.
      const bad = await find(EXT2);
      expect(bad).not.toBeNull();
      expect(bad.closeDateVerifiedAt).toBeNull();
      expect(await versionOf(EXT2)).toBeNull();

      const good = await find(EXT3);
      expect(good.closeDateVerifiedAt).not.toBeNull();
      expect(await versionOf(EXT3)).toBe(1);
    }, 60000);

    it('a changed CANDIDATE SET alone produces a new snapshot version', async () => {
      // Material evidence can change with every published source fact
      // unchanged. Hashing only the source facts left that change unversioned.
      const id = '44444444-4444-4444-8444-444444444444';
      await models.BonfireOpportunity.create({
        id, title: 'Evidence Version Row', externalId: 'bonfire:agency:utah:TX-4',
      });
      const facts = {
        deadlineText: 'Oct 15th 2026, 2:00 PM MDT',
        title: 'Evidence Version Row',
        agency: 'Utah',
        sourceUrl: 'https://utah.bonfirehub.com/opportunities/1004',
        externalId: 'bonfire:agency:utah:TX-4',
      };
      const base = {
        opportunityId: id,
        sourceSystem: 'bonfire',
        sourceFacts: facts,
        fetch: { status: 'success' },
        parse: parseOf('2026-10-15T20:00:00.000Z'),
        rawPresent: true,
        provenance: PROV,
      };

      const first = await ingestObservation(
        { ...base, now: new Date('2026-09-01T00:00:00.000Z') }, { models, sequelize },
      );
      expect(first.sourceSnapshotVersion).toBe(1);

      const unchanged = await ingestObservation(
        { ...base, now: new Date('2026-09-02T00:00:00.000Z') }, { models, sequelize },
      );
      expect(unchanged.snapshotWritten).toBe(false);
      expect(unchanged.sourceSnapshotVersion).toBe(1);

      const withCandidates = await ingestObservation({
        ...base,
        candidates: [
          { utc: '2026-10-15T20:00:00.000Z', source: 'portal' },
          { utc: '2026-10-15T21:00:00.000Z', source: 'lead document' },
        ],
        now: new Date('2026-09-03T00:00:00.000Z'),
      }, { models, sequelize });
      expect(withCandidates.snapshotWritten).toBe(true);
      expect(withCandidates.sourceSnapshotVersion).toBe(2);

      // And the snapshot that records it is retrievable with the evidence in it.
      const snap = await models.GovSourceSnapshot.findOne({
        where: { canonicalId: withCandidates.canonicalId, sourceSnapshotVersion: 2 },
      });
      expect(snap.payload.observation.candidates).toHaveLength(2);
      expect(snap.payload.provenance.authority).toBe('publisher_of_record');
      expect(snap.payload.provenance.authorityEvidence).toMatch(/namespace/i);
    }, 60000);
  });
});
