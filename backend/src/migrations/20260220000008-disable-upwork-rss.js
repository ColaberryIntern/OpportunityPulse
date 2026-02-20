'use strict';

module.exports = {
  async up(queryInterface) {
    // Upwork deprecated public RSS feeds in August 2024.
    await queryInterface.sequelize.query(
      `UPDATE data_sources SET enabled = false WHERE name = 'upwork_rss'`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE data_sources SET enabled = true WHERE name = 'upwork_rss'`
    );
  },
};
