'use strict';

// Adds bonfire_opportunities.external_id (nullable) + partial unique index.
// The scraper populates this with stable per-source IDs (e.g. bonfire:agency:dhantx:RFP-25-007)
// so re-runs upsert instead of duplicate. Existing CSV/JSON uploads do NOT set the column —
// existing rows stay NULL, and the partial index allows unlimited NULLs while enforcing
// uniqueness on any non-NULL value.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bonfire_opportunities', 'external_id', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bonfire_opps_external_id
      ON bonfire_opportunities (external_id)
      WHERE external_id IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS idx_bonfire_opps_external_id;'
    );
    await queryInterface.removeColumn('bonfire_opportunities', 'external_id');
  },
};
