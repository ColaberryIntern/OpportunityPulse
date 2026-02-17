'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('user_roles', [
      {
        role_name: 'admin',
        description: 'Full access to manage users, view all data, configure platform settings.',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        role_name: 'consultant',
        description: 'Create/edit reports, view metrics, participate in forums.',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        role_name: 'auditor',
        description: 'Access compliance reports, review data collection methods.',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        role_name: 'devops',
        description: 'Deploy/manage infrastructure, access performance metrics.',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ], {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('user_roles', null, {});
  },
};
