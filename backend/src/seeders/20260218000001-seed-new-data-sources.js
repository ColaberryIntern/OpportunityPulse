'use strict';

module.exports = {
  async up(queryInterface) {
    // Check which sources already exist to avoid duplicates
    const existing = await queryInterface.sequelize.query(
      "SELECT name FROM data_sources WHERE name IN ('grants_gov', 'sbir_gov', 'usajobs', 'adzuna', 'funding_news')",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const existingNames = existing.map(r => r.name);

    const newSources = [
      {
        name: 'grants_gov',
        type: 'api',
        config: JSON.stringify({
          keywords: ['artificial intelligence', 'machine learning', 'AI/ML', 'data science'],
          rows: 100,
          sortBy: 'openDate',
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'sbir_gov',
        type: 'api',
        config: JSON.stringify({
          keyword: 'artificial intelligence',
          rows: 50,
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'usajobs',
        type: 'api',
        config: JSON.stringify({
          keywords: ['artificial intelligence', 'machine learning', 'data science'],
          resultsPerPage: 100,
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'adzuna',
        type: 'api',
        config: JSON.stringify({
          what: 'artificial intelligence',
          resultsPerPage: 50,
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'funding_news',
        type: 'api',
        config: JSON.stringify({
          feeds: [
            'https://techcrunch.com/category/fundraise/feed/',
            'https://venturebeat.com/category/ai/feed/'
          ],
          keywords: ['AI', 'artificial intelligence', 'raised', 'funding', 'series', 'venture', 'startup', 'million', 'billion'],
        }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ].filter(s => !existingNames.includes(s.name));

    if (newSources.length > 0) {
      await queryInterface.bulkInsert('data_sources', newSources, {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('data_sources', {
      name: ['grants_gov', 'sbir_gov', 'usajobs', 'adzuna', 'funding_news'],
    }, {});
  },
};
