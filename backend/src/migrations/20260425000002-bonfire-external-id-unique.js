'use strict';

// Replace the partial unique index on bonfire_opportunities.external_id with
// a non-partial unique index. Postgres already treats NULLs as DISTINCT in
// unique indexes (by default), so existing rows with NULL external_id are fine
// — they don't conflict with each other.
//
// Why we're swapping: Sequelize's bulkCreate({updateOnDuplicate, conflictAttributes})
// generates `ON CONFLICT (external_id) DO UPDATE` with no WHERE predicate.
// Postgres refuses to use a partial unique index unless the same WHERE clause
// is repeated in the INSERT — which Sequelize doesn't support. The upsert path
// fails with "there is no unique or exclusion constraint matching the ON CONFLICT
// specification" until we drop the predicate.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS idx_bonfire_opps_external_id;'
    );
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bonfire_opps_external_id
      ON bonfire_opportunities (external_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS idx_bonfire_opps_external_id;'
    );
    // Restore the partial form so down(up()) is symmetric with the original
    // migration that created the partial index.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bonfire_opps_external_id
      ON bonfire_opportunities (external_id)
      WHERE external_id IS NOT NULL;
    `);
  },
};
