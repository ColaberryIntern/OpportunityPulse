'use strict';

// Research Intelligence Phase 1 — seed the 3 keyless research data sources.
// They run on the existing daily ingestion cron (per-source cadence is a
// Phase 2 add). Enabled by default so they show up in Source Health on the
// next ingest run.

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('data_sources', [
      {
        name: 'arxiv',
        type: 'api',
        config: JSON.stringify({
          categories: ['cs.AI', 'cs.LG', 'cs.CL', 'cs.MA'],
          perCategory: 40,
        }),
        schedule: '0 6 * * *',
        enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        name: 'semantic_scholar',
        type: 'api',
        config: JSON.stringify({
          queries: [
            'large language model agents',
            'multi-agent systems LLM',
            'retrieval augmented generation',
            'AI reasoning benchmark',
          ],
          perQuery: 25,
        }),
        schedule: '0 6 * * *',
        enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        name: 'huggingface_papers',
        type: 'api',
        config: JSON.stringify({ limit: 100 }),
        schedule: '0 6 * * *',
        enabled: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('data_sources', {
      name: ['arxiv', 'semantic_scholar', 'huggingface_papers'],
    });
  },
};
