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
        enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'sam_gov_scraper',
        type: 'scraper',
        config: JSON.stringify({
          keywords: ['artificial intelligence', 'machine learning', 'AI/ML', 'data science', 'natural language processing'],
          maxResults: 25,
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
