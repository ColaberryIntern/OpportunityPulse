'use strict';

module.exports = {
  async up(queryInterface) {
    // The type column is STRING(30), not a PostgreSQL ENUM.
    // Adding 'grant' only requires updating the Sequelize model validation,
    // which is done in the model file. This migration serves as a record.
  },

  async down(queryInterface) {
    // No DB changes to revert
  },
};
