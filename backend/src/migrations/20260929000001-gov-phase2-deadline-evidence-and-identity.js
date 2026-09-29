'use strict';

// Phase 2 — persisted source evidence for government opportunities.
//
// Additive and reversible. It creates nothing that rewrites or re-interprets
// existing data:
//
//   * NO historical deadline is rewritten.
//   * NO existing row is marked verified. Every pre-existing row gets
//     close_date_verified_at = NULL, which is the honest statement that its
//     stored close_date came from the timezone-stripping parser and has never
//     been verified against a source. "close_date IS NOT NULL" therefore does
//     NOT mean verified, and the read model treats NULL verified_at as
//     UNVERIFIED even when close_date_uncertainty is also NULL.
//   * NO backfill. Deriving provenance we never observed would manufacture
//     evidence.
//
// Four distinctions the previous single-column design could not express, each
// of which was a real source of wrong answers:
//
//   1. EFFECTIVE vs OBSERVED. close_date is what we publish as the deadline;
//      close_date_observation_utc is what the latest parse produced. They
//      differ whenever a newer observation is unresolved or disputed.
//   2. FETCH ATTEMPT vs SUCCESSFUL OBSERVATION. A failed fetch is not an
//      observation of anything. close_date_fetch_attempted_at moves on every
//      attempt; close_date_observed_at moves only on success.
//   3. ABSENT vs UNOBSERVED. NULL raw text does not prove the buyer published
//      no deadline. close_date_source_state says which it is.
//   4. PARSEABLE vs AUTHORITATIVE. A string that parses cleanly is not thereby
//      the authoritative deadline; competing source evidence still has to be
//      resolved. Verification is recorded separately from parsing.

module.exports = {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      const addCol = (name, spec) => queryInterface.addColumn('bonfire_opportunities', name, spec, { transaction });

      // ---- Effective (published) deadline -------------------------------
      // Written ONLY when a resolution is verified. close_date itself already
      // exists; these qualify it.
      await addCol('close_date_verified_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When close_date was last VERIFIED. NULL => unverified, including every legacy row.',
      });
      await addCol('close_date_verified_source', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'What established the verified deadline (e.g. portal_scrape, lead_source_document).',
      });

      // ---- Latest successful observation --------------------------------
      await addCol('close_date_observed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last SUCCESSFUL source observation. Not moved by a failed fetch.',
      });
      await addCol('close_date_observation_utc', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Instant the latest observation parsed to. May differ from close_date; parsing is not authority.',
      });
      await addCol('close_date_observation_confidence', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Confidence of the OBSERVATION (high|unknown). Distinct from whether close_date is verified.',
      });
      await addCol('close_date_raw', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Verbatim source text, never normalised.',
      });
      await addCol('close_date_timezone', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
      await addCol('close_date_timezone_source', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'offset | abbreviation | named_zone | absent | unresolvable',
      });
      await addCol('close_date_offset_minutes', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
      await addCol('close_date_uncertainty', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Detailed INTERNAL parser reason. Mapped to the frozen v1 enum at the API edge.',
      });
      await addCol('close_date_observation_outcome', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'EXPLICIT outcome of the latest successful observation: parsed | conflict | '
          + 'unparsed | absent_confirmed | capture_unknown | fetch_failed. Recorded, never inferred.',
      });
      await addCol('close_date_verification_basis', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Why the effective deadline counts as verified. Required alongside '
          + 'close_date_verified_source; parsing alone does not establish source authority.',
      });
      await addCol('close_date_source_state', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'not_observed | fetch_failed | not_published | published_unparsed | published_parsed. '
          + 'Distinguishes "buyer published no deadline" from "we have not looked".',
      });

      // ---- Fetch attempt, separate from observation ---------------------
      await addCol('close_date_fetch_attempted_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Every attempt, success or failure.',
      });
      await addCol('close_date_fetch_status', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'success | failed',
      });
      await addCol('close_date_fetch_error', {
        type: Sequelize.TEXT,
        allowNull: true,
      });

      // ---- Structured evidence ------------------------------------------
      await addCol('close_date_candidates', {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Competing candidate instants: [{utc, offsetMinutes, source, observedAt, originalText}].',
      });
      await addCol('close_date_conservative_utc', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Earliest candidate. Planning aid ONLY; never published as the deadline.',
      });
      await addCol('close_date_superseded', {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Prior EFFECTIVE values: [{utc, verifiedAt, replacedAt, reason}]. Append-only.',
      });

      await queryInterface.addIndex('bonfire_opportunities', ['close_date_verified_at'], {
        name: 'idx_bonfire_close_date_verified_at', transaction,
      });
      await queryInterface.addIndex('bonfire_opportunities', ['close_date_source_state'], {
        name: 'idx_bonfire_close_date_source_state', transaction,
      });

      // ---- Canonical identity -------------------------------------------
      // Opaque, stable, and NEVER derived from title or solicitation number,
      // both of which change under us.
      await queryInterface.createTable('gov_canonical_opportunities', {
        canonical_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        // Opaque PUBLIC id handed to consumers. Stored and uniquely indexed so
        // detail lookups resolve by index instead of scanning and hashing rows.
        canonical_public_id: { type: Sequelize.TEXT, allowNull: false },
        source_system: { type: Sequelize.TEXT, allowNull: false },
        source_snapshot_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction });

      await queryInterface.addIndex('gov_canonical_opportunities', ['canonical_public_id'], {
        unique: true, name: 'uniq_gov_canonical_public_id', transaction,
      });

      // Aliases record duplicates rather than merging them away. A notice keeps
      // its own identity; several aliases may point at one canonical record.
      await queryInterface.createTable('gov_source_aliases', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        canonical_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'gov_canonical_opportunities', key: 'canonical_id' },
          onDelete: 'CASCADE',
        },
        id_type: { type: Sequelize.TEXT, allowNull: false },
        id_value: { type: Sequelize.TEXT, allowNull: false },
        observed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        note: { type: Sequelize.TEXT, allowNull: true },
      }, { transaction });
      // One alias resolves to exactly one canonical record.
      await queryInterface.addIndex('gov_source_aliases', ['id_type', 'id_value'], {
        unique: true, name: 'uniq_gov_source_alias', transaction,
      });
      await queryInterface.addIndex('gov_source_aliases', ['canonical_id'], {
        name: 'idx_gov_source_alias_canonical', transaction,
      });

      // ---- Solicitation families ----------------------------------------
      // LINKING, not deduplication. Membership never collapses notices.
      await queryInterface.createTable('gov_solicitation_families', {
        family_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        solicitation_number: { type: Sequelize.TEXT, allowNull: true },
        link_basis: { type: Sequelize.TEXT, allowNull: false },
        confidence: { type: Sequelize.TEXT, allowNull: false, defaultValue: 'medium' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction });

      await queryInterface.createTable('gov_family_members', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        family_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'gov_solicitation_families', key: 'family_id' },
          onDelete: 'CASCADE',
        },
        canonical_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'gov_canonical_opportunities', key: 'canonical_id' },
          onDelete: 'CASCADE',
        },
        added_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction });
      await queryInterface.addIndex('gov_family_members', ['family_id', 'canonical_id'], {
        unique: true, name: 'uniq_gov_family_member', transaction,
      });

      // ---- Immutable source snapshots ------------------------------------
      // source_snapshot_version advances only when SOURCE facts change, which
      // is why content_hash is over source facts and excludes enrichment.
      await queryInterface.createTable('gov_source_snapshots', {
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        canonical_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'gov_canonical_opportunities', key: 'canonical_id' },
          onDelete: 'CASCADE',
        },
        source_snapshot_version: { type: Sequelize.INTEGER, allowNull: false },
        content_hash: { type: Sequelize.TEXT, allowNull: false },
        fetch_attempted_at: { type: Sequelize.DATE, allowNull: true },
        fetch_status: { type: Sequelize.TEXT, allowNull: false },
        fetch_error: { type: Sequelize.TEXT, allowNull: true },
        observed_at: { type: Sequelize.DATE, allowNull: true },
        payload: { type: Sequelize.JSONB, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction });
      await queryInterface.addIndex('gov_source_snapshots', ['canonical_id', 'source_snapshot_version'], {
        unique: true, name: 'uniq_gov_snapshot_version', transaction,
      });

      // Immutability enforced in the database, not merely by convention.
      await sequelize.query(`
        CREATE OR REPLACE FUNCTION gov_source_snapshots_immutable()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'gov_source_snapshots is append-only (attempted % on snapshot %)',
            TG_OP, COALESCE(OLD.id::text, '?');
        END;
        $$ LANGUAGE plpgsql;
      `, { transaction });
      await sequelize.query(`
        CREATE TRIGGER trg_gov_source_snapshots_immutable
        BEFORE UPDATE OR DELETE ON gov_source_snapshots
        FOR EACH ROW EXECUTE FUNCTION gov_source_snapshots_immutable();
      `, { transaction });
    });
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    await sequelize.transaction(async (transaction) => {
      await sequelize.query('DROP TRIGGER IF EXISTS trg_gov_source_snapshots_immutable ON gov_source_snapshots;', { transaction });
      await sequelize.query('DROP FUNCTION IF EXISTS gov_source_snapshots_immutable();', { transaction });
      await queryInterface.dropTable('gov_source_snapshots', { transaction });
      await queryInterface.dropTable('gov_family_members', { transaction });
      await queryInterface.dropTable('gov_solicitation_families', { transaction });
      await queryInterface.dropTable('gov_source_aliases', { transaction });
      await queryInterface.dropTable('gov_canonical_opportunities', { transaction });

      await queryInterface.removeIndex('bonfire_opportunities', 'idx_bonfire_close_date_source_state', { transaction });
      await queryInterface.removeIndex('bonfire_opportunities', 'idx_bonfire_close_date_verified_at', { transaction });

      for (const col of [
        'close_date_superseded', 'close_date_conservative_utc', 'close_date_candidates',
        'close_date_fetch_error', 'close_date_fetch_status', 'close_date_fetch_attempted_at',
        'close_date_source_state', 'close_date_verification_basis',
        'close_date_observation_outcome', 'close_date_uncertainty', 'close_date_offset_minutes',
        'close_date_timezone_source', 'close_date_timezone', 'close_date_raw',
        'close_date_observation_confidence', 'close_date_observation_utc', 'close_date_observed_at',
        'close_date_verified_source', 'close_date_verified_at',
      ]) {
        await queryInterface.removeColumn('bonfire_opportunities', col, { transaction });
      }
    });
  },
};
