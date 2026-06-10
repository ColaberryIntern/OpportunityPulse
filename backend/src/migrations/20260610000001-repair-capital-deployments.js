'use strict';

// v9.11 — Repair the Capital Deployments channel.
//
// Three compounding failures had frozen this surface at its Feb-2026 seed:
//   1. The funding_news data_sources row pinned config.feeds to TechCrunch's
//      /category/fundraise/ URL, which 404'd in early 2026. The May code fix
//      to DEFAULT_FEEDS never applied because `config.feeds || DEFAULT_FEEDS`
//      let the stale DB value win. → repair the row in place (the 2026-02-18
//      seeder is insert-if-absent, so re-running it does nothing).
//   2. funding_news rows carried no aiScore, so they sorted below seeded demo
//      rows under the digest's `aiScore DESC NULLS LAST`. → fixed in the
//      adapter (this migration only touches data/registry).
//   3. The 5 seeded mock_investments demo rows have expires_at = NULL + high
//      scores, permanently occupying the top-3. → expire them so real rows
//      can surface. Kept (not deleted) so they remain a labelled fallback.
//
// Also registers the new sec_edgar_formd source (DISABLED — flip on only after
// a manual smoke run confirms the live EDGAR response shape).

const WORKING_FEEDS = [
  'https://techcrunch.com/category/venture/feed/',
  'https://news.crunchbase.com/feed/',
  'https://venturebeat.com/category/ai/feed/',
];
const FUNDING_KEYWORDS = [
  'AI', 'artificial intelligence', 'raised', 'funding',
  'series', 'venture', 'startup', 'million', 'billion',
];

module.exports = {
  async up(qi) {
    const sequelize = qi.sequelize;

    // 1. Repair funding_news feeds in place.
    await sequelize.query(
      `UPDATE data_sources
         SET config = :config, enabled = true, updated_at = NOW()
       WHERE name = 'funding_news'`,
      {
        replacements: {
          config: JSON.stringify({ feeds: WORKING_FEEDS, keywords: FUNDING_KEYWORDS }),
        },
      },
    );

    // 2. Register sec_edgar_formd (disabled until smoke-tested).
    const [existing] = await sequelize.query(
      `SELECT name FROM data_sources WHERE name = 'sec_edgar_formd'`,
    );
    if (!existing || existing.length === 0) {
      await sequelize.query(
        `INSERT INTO data_sources (name, type, config, schedule, enabled, created_at, updated_at)
         VALUES ('sec_edgar_formd', 'api', :config, 'daily', false, NOW(), NOW())`,
        {
          replacements: {
            config: JSON.stringify({
              keywords: ['artificial intelligence', 'machine learning', 'generative AI'],
              maxPerKeyword: 30,
            }),
          },
        },
      );
    }

    // 3. Retire the permanent mock_investments demo rows. Expire (don't delete)
    //    so they survive as a fallback but stop occupying the live top-3.
    await sequelize.query(
      `UPDATE opportunities
         SET expires_at = NOW() - INTERVAL '1 day', updated_at = NOW()
       WHERE source = 'mock_investments'
         AND (expires_at IS NULL OR expires_at > NOW())`,
    );
  },

  async down(qi) {
    const sequelize = qi.sequelize;

    // Un-retire the mock rows (investments never expire by nature).
    await sequelize.query(
      `UPDATE opportunities
         SET expires_at = NULL, updated_at = NOW()
       WHERE source = 'mock_investments'`,
    );

    // Remove the new source registration.
    await sequelize.query(
      `DELETE FROM data_sources WHERE name = 'sec_edgar_formd'`,
    );

    // funding_news feed repair is intentionally NOT reverted — restoring the
    // dead /fundraise/ URL has no value and would re-break the channel.
  },
};
