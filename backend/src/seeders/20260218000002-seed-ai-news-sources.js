module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      "SELECT name FROM data_sources WHERE name IN ('google_news', 'hacker_news', 'devto', 'reddit_ai')",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const existingNames = existing.map(r => r.name);

    const newSources = [
      {
        name: 'google_news',
        type: 'rss',
        config: JSON.stringify({ queries: ['artificial intelligence', 'machine learning', 'generative AI'], maxItems: 100 }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'hacker_news',
        type: 'api',
        config: JSON.stringify({ queries: ['artificial intelligence', 'machine learning', 'LLM'], hitsPerPage: 50, minPoints: 5 }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'devto',
        type: 'api',
        config: JSON.stringify({ tags: ['ai', 'machinelearning', 'artificialintelligence', 'llm'], perPage: 30 }),
        schedule: 'daily',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        name: 'reddit_ai',
        type: 'api',
        config: JSON.stringify({ subreddits: ['artificial', 'MachineLearning'], timeFilter: 'week', limit: 30, minScore: 10 }),
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
      name: ['google_news', 'hacker_news', 'devto', 'reddit_ai'],
    }, {});
  },
};
