/**
 * Phase 2 migration — real Postgres, non-production, disposable.
 *
 * Skipped unless PHASE2_TEST_DB_URL is set, so a normal CI run is unaffected.
 * Spin one up with:
 *
 *   docker run -d --name op-phase2-testdb -e POSTGRES_PASSWORD=testpw \
 *     -e POSTGRES_USER=testuser -e POSTGRES_DB=optest -p 55433:5432 postgres:15-alpine
 *   PHASE2_TEST_DB_URL=postgres://testuser:testpw@localhost:55433/optest \
 *     npx jest tests/integration/govPhase2Migration
 *
 * What this proves that a unit test cannot:
 *   - the migration applies and rolls back cleanly against a real engine
 *   - it does NOT rewrite historical deadlines or mark any of them verified
 *   - snapshot immutability is enforced by the DATABASE, not by convention
 *   - concurrent ingestion cannot lose an appended history entry
 */

const { Sequelize, DataTypes } = require('sequelize');

const URL = process.env.PHASE2_TEST_DB_URL;
const d = URL ? describe : describe.skip;

const migration = require('../../src/migrations/20260929000001-gov-phase2-deadline-evidence-and-identity');

// A legacy row: close_date present, nothing ever verified it.
const LEGACY_CLOSE = '2026-10-15T14:00:00.000Z';
const LEGACY_ID = '99999999-9999-4999-8999-999999999999';

d('Phase 2 migration against real Postgres', () => {
  let sequelize;
  let qi;

  beforeAll(async () => {
    sequelize = new Sequelize(URL, { logging: false });
    qi = sequelize.getQueryInterface();

    // Minimal stand-in for the real table: the migration only adds columns.
    await sequelize.query('DROP TABLE IF EXISTS bonfire_opportunities CASCADE;');
    await qi.createTable('bonfire_opportunities', {
      id: { type: DataTypes.UUID, primaryKey: true },
      title: { type: DataTypes.STRING(500), allowNull: false },
      close_date: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await sequelize.query(
      'INSERT INTO bonfire_opportunities (id, title, close_date) VALUES (:id, :t, :c)',
      { replacements: { id: LEGACY_ID, t: 'Legacy row', c: LEGACY_CLOSE } },
    );
  }, 60000);

  afterAll(async () => {
    if (sequelize) await sequelize.close();
  });

  // QueryTypes.SELECT returns a flat array of row objects, which is unambiguous;
  // the bare [rows] destructure can pick up the metadata tuple instead.
  const columns = async () => {
    const rows = await sequelize.query(
      "SELECT column_name::text AS name FROM information_schema.columns WHERE table_name='bonfire_opportunities'",
      { type: Sequelize.QueryTypes.SELECT },
    );
    return rows.map((r) => r.name);
  };
  const tables = async () => {
    const rows = await sequelize.query(
      "SELECT table_name::text AS name FROM information_schema.tables WHERE table_schema='public'",
      { type: Sequelize.QueryTypes.SELECT },
    );
    return rows.map((r) => r.name);
  };

  it('UP applies cleanly', async () => {
    await migration.up(qi, Sequelize);
    const cols = await columns();
    for (const c of [
      'close_date_verified_at', 'close_date_verified_source', 'close_date_observed_at',
      'close_date_observation_utc', 'close_date_observation_confidence', 'close_date_raw',
      'close_date_timezone', 'close_date_timezone_source', 'close_date_offset_minutes',
      'close_date_uncertainty', 'close_date_source_state', 'close_date_fetch_attempted_at',
      'close_date_fetch_status', 'close_date_fetch_error', 'close_date_candidates',
      'close_date_conservative_utc', 'close_date_superseded',
    ]) {
      expect(cols).toContain(c);
    }
    const t = await tables();
    for (const n of [
      'gov_canonical_opportunities', 'gov_source_aliases',
      'gov_solicitation_families', 'gov_family_members', 'gov_source_snapshots',
    ]) {
      expect(t).toContain(n);
    }
  }, 60000);

  it('does NOT rewrite the historical deadline', async () => {
    const [[row]] = await sequelize.query(
      'SELECT close_date FROM bonfire_opportunities WHERE id = :id', { replacements: { id: LEGACY_ID } },
    );
    expect(new Date(row.close_date).toISOString()).toBe(LEGACY_CLOSE);
  });

  it('does NOT mark any historical row verified', async () => {
    const [[row]] = await sequelize.query(
      'SELECT close_date_verified_at, close_date_uncertainty, close_date_source_state '
      + 'FROM bonfire_opportunities WHERE id = :id', { replacements: { id: LEGACY_ID } },
    );
    // The load-bearing assertion: a value exists, and nothing claims it was verified.
    expect(row.close_date_verified_at).toBeNull();
    expect(row.close_date_uncertainty).toBeNull();
    expect(row.close_date_source_state).toBeNull();
  });

  it('backfills nothing at all', async () => {
    const [[{ count }]] = await sequelize.query(
      'SELECT COUNT(*)::int AS count FROM bonfire_opportunities WHERE close_date_verified_at IS NOT NULL',
    );
    expect(count).toBe(0);
  });

  describe('snapshot immutability is enforced by the database', () => {
    const canonical = '88888888-8888-4888-8888-888888888888';

    beforeAll(async () => {
      await sequelize.query(
        "INSERT INTO gov_canonical_opportunities (canonical_id, source_system, source_snapshot_version, created_at, updated_at) "
        + "VALUES (:c, 'bonfire', 1, NOW(), NOW())", { replacements: { c: canonical } },
      );
      await sequelize.query(
        "INSERT INTO gov_source_snapshots (id, canonical_id, source_snapshot_version, content_hash, fetch_status, payload, created_at) "
        + "VALUES (gen_random_uuid(), :c, 1, 'hash-1', 'success', '{\"a\":1}'::jsonb, NOW())",
        { replacements: { c: canonical } },
      );
    });

    it('rejects UPDATE', async () => {
      await expect(
        sequelize.query("UPDATE gov_source_snapshots SET content_hash = 'tampered' WHERE canonical_id = :c",
          { replacements: { c: canonical } }),
      ).rejects.toThrow(/append-only/i);
    });

    it('rejects DELETE', async () => {
      await expect(
        sequelize.query('DELETE FROM gov_source_snapshots WHERE canonical_id = :c',
          { replacements: { c: canonical } }),
      ).rejects.toThrow(/append-only/i);
    });

    it('still allows INSERT of a new version', async () => {
      await sequelize.query(
        "INSERT INTO gov_source_snapshots (id, canonical_id, source_snapshot_version, content_hash, fetch_status, payload, created_at) "
        + "VALUES (gen_random_uuid(), :c, 2, 'hash-2', 'success', '{\"a\":2}'::jsonb, NOW())",
        { replacements: { c: canonical } },
      );
      const [[{ count }]] = await sequelize.query(
        'SELECT COUNT(*)::int AS count FROM gov_source_snapshots WHERE canonical_id = :c',
        { replacements: { c: canonical } },
      );
      expect(count).toBe(2);
    });

    it('refuses a duplicate version for the same record', async () => {
      await expect(sequelize.query(
        "INSERT INTO gov_source_snapshots (id, canonical_id, source_snapshot_version, content_hash, fetch_status, payload, created_at) "
        + "VALUES (gen_random_uuid(), :c, 2, 'dup', 'success', '{}'::jsonb, NOW())",
        { replacements: { c: canonical } },
      )).rejects.toThrow();
    });
  });

  describe('aliases record duplicates without merging them', () => {
    const canonical = '77777777-7777-4777-8777-777777777777';

    it('accepts several aliases for one canonical record', async () => {
      await sequelize.query(
        "INSERT INTO gov_canonical_opportunities (canonical_id, source_system, source_snapshot_version, created_at, updated_at) "
        + "VALUES (:c, 'sam.gov', 1, NOW(), NOW())", { replacements: { c: canonical } },
      );
      for (const [t, v] of [['source_record_id', 'abc'], ['legacy_row_id', '96771'], ['legacy_row_id', '97872']]) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          'INSERT INTO gov_source_aliases (canonical_id, id_type, id_value, observed_at) VALUES (:c, :t, :v, NOW())',
          { replacements: { c: canonical, t, v } },
        );
      }
      const [[{ count }]] = await sequelize.query(
        'SELECT COUNT(*)::int AS count FROM gov_source_aliases WHERE canonical_id = :c',
        { replacements: { c: canonical } },
      );
      expect(count).toBe(3); // duplicates recorded, not collapsed
    });

    it('refuses to let one alias resolve to two canonical records', async () => {
      await expect(sequelize.query(
        "INSERT INTO gov_source_aliases (canonical_id, id_type, id_value, observed_at) "
        + "VALUES ('88888888-8888-4888-8888-888888888888', 'source_record_id', 'abc', NOW())",
      )).rejects.toThrow();
    });
  });

  describe('concurrent ingestion preserves appended history', () => {
    it('two concurrent writers both land their entry under row locking', async () => {
      const id = '66666666-6666-4666-8666-666666666666';
      await sequelize.query(
        "INSERT INTO bonfire_opportunities (id, title, close_date_superseded) VALUES (:id, 'concurrent', '[]'::jsonb)",
        { replacements: { id } },
      );

      // Each writer locks the row, reads history, appends, writes. Without the
      // lock these interleave and one append is lost.
      const append = (tag) => sequelize.transaction(async (transaction) => {
        const [[row]] = await sequelize.query(
          'SELECT close_date_superseded FROM bonfire_opportunities WHERE id = :id FOR UPDATE',
          { replacements: { id }, transaction },
        );
        const history = row.close_date_superseded || [];
        const next = [...history, { utc: `2026-10-0${tag}T00:00:00.000Z`, reason: `writer-${tag}` }];
        await sequelize.query(
          'UPDATE bonfire_opportunities SET close_date_superseded = :h WHERE id = :id',
          { replacements: { id, h: JSON.stringify(next) }, transaction },
        );
      });

      await Promise.all([append(1), append(2)]);

      const [[row]] = await sequelize.query(
        'SELECT close_date_superseded FROM bonfire_opportunities WHERE id = :id', { replacements: { id } },
      );
      expect(row.close_date_superseded).toHaveLength(2);
      const reasons = row.close_date_superseded.map((h) => h.reason).sort();
      expect(reasons).toEqual(['writer-1', 'writer-2']);
    }, 60000);
  });

  it('DOWN rolls back cleanly and leaves the original data intact', async () => {
    await migration.down(qi, Sequelize);

    const cols = await columns();
    for (const c of ['close_date_verified_at', 'close_date_candidates', 'close_date_superseded']) {
      expect(cols).not.toContain(c);
    }
    const t = await tables();
    for (const n of ['gov_source_snapshots', 'gov_source_aliases', 'gov_canonical_opportunities']) {
      expect(t).not.toContain(n);
    }
    // close_date itself survives untouched — rollback must not lose data.
    const [[row]] = await sequelize.query(
      'SELECT close_date FROM bonfire_opportunities WHERE id = :id', { replacements: { id: LEGACY_ID } },
    );
    expect(new Date(row.close_date).toISOString()).toBe(LEGACY_CLOSE);
  }, 60000);

  it('UP is re-appliable after DOWN (idempotent cycle)', async () => {
    await migration.up(qi, Sequelize);
    expect(await columns()).toContain('close_date_verified_at');
    await migration.down(qi, Sequelize);
    expect(await columns()).not.toContain('close_date_verified_at');
  }, 120000);
});
