'use strict';

// Research Intelligence Phase 2.4 — per-source ingestion cadence.
//
// The single daily ingestion runner stays as-is for every existing source.
// This adds an optional `ingest_interval_minutes` column: when set, a
// lightweight tick loop (research.scheduler.js) runs that source whenever
// `now - last_run_at >= ingest_interval_minutes`, independent of the daily
// cron. NULL = unchanged behavior (daily-cron only).
//
// We seed the 3 research sources with intervals from the expansion plan:
//   arxiv 120 min, semantic_scholar 1440 min, huggingface_papers 360 min.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('data_sources', 'ingest_interval_minutes', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    // Seed cadences for the research sources (only if the rows exist).
    await queryInterface.sequelize.query(`
      UPDATE data_sources SET ingest_interval_minutes = 120  WHERE name = 'arxiv';
      UPDATE data_sources SET ingest_interval_minutes = 1440 WHERE name = 'semantic_scholar';
      UPDATE data_sources SET ingest_interval_minutes = 360  WHERE name = 'huggingface_papers';
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('data_sources', 'ingest_interval_minutes');
  },
};
