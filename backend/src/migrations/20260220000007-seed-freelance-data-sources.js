'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('data_sources', [
      {
        name: 'upwork_rss',
        type: 'rss',
        config: JSON.stringify({
          searches: ['artificial intelligence', 'machine learning', 'llm', 'chatbot', 'NLP', 'computer vision'],
        }),
        schedule: '0 */4 * * *',
        enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        name: 'freelancer_api',
        type: 'api',
        config: JSON.stringify({
          baseUrl: 'https://www.freelancer.com/api',
          searches: ['AI', 'machine learning', 'NLP', 'computer vision', 'deep learning', 'chatbot'],
        }),
        schedule: '0 */6 * * *',
        enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        name: 'linkedin_manual',
        type: 'manual',
        config: JSON.stringify({}),
        schedule: null,
        enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        name: 'generic_freelance_rss',
        type: 'rss',
        config: JSON.stringify({ feeds: [] }),
        schedule: '0 */8 * * *',
        enabled: false,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('data_sources', {
      name: ['upwork_rss', 'freelancer_api', 'linkedin_manual', 'generic_freelance_rss'],
    });
  },
};
