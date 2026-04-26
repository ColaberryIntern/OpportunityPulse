'use strict';

// Adds bonfire_strategic_opportunities.source_hash + a partial unique index.
//
// source_hash = SHA256 of (sorted source-bonfire IDs + their enrichment_hashes).
// Two runs with the same source content produce the same hash, so the second
// run can detect "we already analyzed this exact set" and skip the AI call.
// Cuts sustained agent cost to near-zero for unchanged opportunity content.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bonfire_strategic_opportunities', 'source_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    // Partial unique avoids backfill pain — existing rows have NULL hash and
    // don't conflict with each other. New rows must have a hash.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bonfire_strategic_source_hash
      ON bonfire_strategic_opportunities (source_hash)
      WHERE source_hash IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS idx_bonfire_strategic_source_hash;'
    );
    await queryInterface.removeColumn('bonfire_strategic_opportunities', 'source_hash');
  },
};
