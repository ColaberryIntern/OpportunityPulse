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
          keywords: ['artificial intelligence', 'machine learning', 'AI/ML', 'data science', 'natural language processing'],
          naicsCode: '541715',
        }),
        schedule: 'daily',
        enabled: true,
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
        enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'mock_jobs',
        type: 'mock',
        config: JSON.stringify({}),
        schedule: null,
        enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'mock_investments',
        type: 'mock',
        config: JSON.stringify({}),
        schedule: null,
        enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'usa_spending',
        type: 'api',
        config: JSON.stringify({
          keywords: ['artificial intelligence', 'machine learning', 'AI/ML', 'data science', 'natural language processing'],
          maxPages: 3,
          resultsPerPage: 100,
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'remotive',
        type: 'api',
        config: JSON.stringify({
          searches: ['artificial intelligence', 'machine learning'],
          limit: 50,
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'remote_ok',
        type: 'api',
        config: JSON.stringify({
          searches: ['ai', 'machine learning', 'artificial intelligence'],
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'himalayas',
        type: 'api',
        config: JSON.stringify({
          keywords: ['artificial intelligence', 'machine learning', 'AI', 'data science', 'deep learning', 'NLP', 'computer vision', 'LLM'],
          maxPages: 3,
          limit: 50,
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'jobicy',
        type: 'api',
        config: JSON.stringify({
          tags: ['ai', 'machine-learning', 'data-science'],
          count: 50,
        }),
        schedule: 'daily',
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
