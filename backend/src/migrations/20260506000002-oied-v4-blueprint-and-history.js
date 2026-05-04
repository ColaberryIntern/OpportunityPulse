'use strict';

// OIED v4 — bundles.blueprint + blueprint_hash. Independent of the
// strategy_hash column so blueprint can be regenerated without
// invalidating the strategy cache.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bundles', 'blueprint', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
    await queryInterface.addColumn('bundles', 'blueprint_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('bundles', 'blueprint_hash');
    await queryInterface.removeColumn('bundles', 'blueprint');
  },
};
