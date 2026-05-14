'use strict';

// Research Intelligence Phase 2.5 — seed the tier-2 research data sources.
// papers_with_code: keyless API, strongest "buildable" signal (linked repos).
// research_blogs: configurable multi-feed RSS for frontier-lab blogs.
// Both keyless, enabled, with per-source ingest intervals (Phase 2.4).

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('data_sources', [
      {
        name: 'papers_with_code',
        type: 'api',
        config: JSON.stringify({ pages: 2 }),
        schedule: '0 6 * * *',
        ingest_interval_minutes: 360,
        enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        name: 'research_blogs',
        type: 'rss',
        config: JSON.stringify({
          feeds: [
            { url: 'https://openai.com/blog/rss.xml', lab: 'OpenAI' },
            { url: 'https://deepmind.google/blog/rss.xml', lab: 'DeepMind' },
            { url: 'https://bair.berkeley.edu/blog/feed.xml', lab: 'BAIR' },
          ],
        }),
        schedule: '0 6 * * *',
        ingest_interval_minutes: 720,
        enabled: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('data_sources', {
      name: ['papers_with_code', 'research_blogs'],
    });
  },
};
