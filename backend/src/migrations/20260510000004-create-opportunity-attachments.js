'use strict';

// Submission Readiness Engine v0.4 — per-opp attachment locker.
// One row per RFP attachment downloaded from a procurement portal.
// In v0.4 only Bonfire is wired (source='bonfire'); SAM.gov + grants.gov
// fetchers come in v0.5 — the table is shaped to take them without
// migration.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('opportunity_attachments', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      // Polymorphic-ish: bonfire_opportunity_id covers Bonfire today; future
      // sam.gov / grants.gov fetchers will populate opportunity_id (the
      // unified Opportunity table). Each row uses ONE of the two.
      bonfire_opportunity_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'bonfire_opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      source: {
        type: Sequelize.STRING(20),
        allowNull: false,
        // 'bonfire' | 'sam_gov' | 'grants_gov' | 'manual'
      },
      name: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      file_path: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      mime: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      url_original: {
        type: Sequelize.STRING(800),
        allowNull: true,
      },
      // pdf-parse / mammoth output, cached to avoid re-extracting per AI call.
      parsed_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      downloaded_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('opportunity_attachments', ['bonfire_opportunity_id'], {
      name: 'idx_opp_attachments_bonfire',
    });
    await queryInterface.addIndex('opportunity_attachments', ['opportunity_id'], {
      name: 'idx_opp_attachments_opportunity',
    });
    await queryInterface.addIndex('opportunity_attachments', ['source'], {
      name: 'idx_opp_attachments_source',
    });
    // Idempotency: re-downloading the same URL for the same bid replaces the
    // existing row instead of creating a duplicate.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_opp_attachments_bonfire_url
      ON opportunity_attachments (bonfire_opportunity_id, url_original)
      WHERE bonfire_opportunity_id IS NOT NULL AND url_original IS NOT NULL;
    `);

    // Mark when we've fetched for a given bid so we don't keep retrying.
    await queryInterface.addColumn('bonfire_opportunities', 'attachments_fetched_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('bonfire_opportunities', 'attachments_fetched_at');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_opp_attachments_bonfire_url;');
    await queryInterface.removeIndex('opportunity_attachments', 'idx_opp_attachments_source');
    await queryInterface.removeIndex('opportunity_attachments', 'idx_opp_attachments_opportunity');
    await queryInterface.removeIndex('opportunity_attachments', 'idx_opp_attachments_bonfire');
    await queryInterface.dropTable('opportunity_attachments');
  },
};
