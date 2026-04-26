'use strict';

// Adds bonfire_agencies.priority_score so the scraper can iterate the
// vendor-network in best-first order. Score is computed each run from the
// agency's accumulated opportunity data (volume, fit, region bonus) — see
// bonfire/scraper/agencyScoring.js. Higher = scrape sooner.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bonfire_agencies', 'priority_score', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addIndex('bonfire_agencies', ['priority_score'], {
      name: 'idx_bonfire_agencies_priority',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('bonfire_agencies', 'idx_bonfire_agencies_priority').catch(() => {});
    await queryInterface.removeColumn('bonfire_agencies', 'priority_score');
  },
};
