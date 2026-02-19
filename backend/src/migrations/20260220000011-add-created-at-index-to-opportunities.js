'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('opportunities', ['created_at'], {
      name: 'opportunities_created_at_idx',
    });
    await queryInterface.addIndex('opportunities', ['status', 'created_at'], {
      name: 'opportunities_status_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('opportunities', 'opportunities_created_at_idx');
    await queryInterface.removeIndex('opportunities', 'opportunities_status_created_at_idx');
  },
};
