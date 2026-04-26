'use strict';

// Per-agency state for the Bonfire scraper.
//
// Used by:
//   - skip-if-recent gate: don't re-hit an agency portal if last_scraped_at is
//     within the freshness window (default 72h). Drops scrape footprint by ~3x.
//   - block-streak suppression: agencies that have CF-blocked us 3+ runs in a
//     row get deprioritized (later, post-MVP).
//   - audit / observability: shows when we last touched each agency and how
//     many opps we last saw.
//
// Adding a separate table (vs. a column on bonfire_opportunities) because:
//   - agencies that returned 0 open opps don't have any rows we could query
//   - we want to track block status / consecutive-failure counters separately
//     from per-opportunity state.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bonfire_agencies', {
      subdomain: {
        type: Sequelize.STRING(100),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },
      region: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      last_scraped_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_succeeded_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_open_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      consecutive_blocks: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      last_block_reason: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('bonfire_agencies', ['last_scraped_at'], {
      name: 'idx_bonfire_agencies_last_scraped',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('bonfire_agencies', 'idx_bonfire_agencies_last_scraped').catch(() => {});
    await queryInterface.dropTable('bonfire_agencies');
  },
};
