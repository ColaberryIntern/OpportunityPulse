'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('data_sources', [
      {
        name: 'sam_gov',
        type: 'api',
        config: JSON.stringify({
          lookbackDays: 7,
          pageLimit: 100,
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'mock_jobs',
        type: 'mock',
        config: JSON.stringify({}),
        schedule: null,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'mock_investments',
        type: 'mock',
        config: JSON.stringify({}),
        schedule: null,
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ], {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('data_sources', null, {});
  },
};
