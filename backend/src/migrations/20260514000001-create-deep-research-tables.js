'use strict';

// Deep Research Intelligence Engine — Phase 1 foundational schema.
//
// Four tables that turn cross-channel opportunity data into venture
// intelligence:
//
//   deep_research_reports  — one synthesized report per search term / scan.
//                            Holds the executive narrative + the full
//                            structured report_json (signals, gov alignment,
//                            research highlights, suggested MVPs, etc.).
//   venture_ideas          — the commercializable ideas generated FROM a
//                            report. One report → many venture ideas.
//   project_generation_jobs— a venture idea handed to the AI Project
//                            Architect (Agent Foundry) for requirements
//                            generation. Tracks phase + progress for polling.
//   daily_research_scans   — the once-per-day automated scan log: which
//                            topic, which report it produced, status.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- deep_research_reports -----------------------------------------
    await queryInterface.createTable('deep_research_reports', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      search_term: { type: Sequelize.STRING(300), allowNull: false },
      // running | success | partial | failed
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'running' },
      executive_summary: { type: Sequelize.TEXT, allowNull: true },
      // too_early | emerging | active | saturated | unknown
      market_stage: { type: Sequelize.STRING(40), allowNull: true },
      confidence_score: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      // The full structured report — opportunity_signals, government_alignment,
      // research_highlights, suggested_mvps, monetization_strategy, build_rec,
      // trend_summary, market_timing_narrative, source breakdown.
      report_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // How many opportunities were synthesized into this report.
      source_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // 'manual' (My Opportunities button) | 'daily_scan'
      origin: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'manual' },
      organization_id: { type: Sequelize.INTEGER, allowNull: true },
      created_by: { type: Sequelize.INTEGER, allowNull: true },
      analysis_run_id: { type: Sequelize.INTEGER, allowNull: true },
      error: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('deep_research_reports', ['created_at'], { name: 'idx_deep_research_reports_created' });
    await queryInterface.addIndex('deep_research_reports', ['search_term'], { name: 'idx_deep_research_reports_term' });
    await queryInterface.addIndex('deep_research_reports', ['status'], { name: 'idx_deep_research_reports_status' });

    // ---- venture_ideas --------------------------------------------------
    await queryInterface.createTable('venture_ideas', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      report_id: { type: Sequelize.INTEGER, allowNull: false },
      title: { type: Sequelize.STRING(300), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      monetization_strategy: { type: Sequelize.TEXT, allowNull: true },
      // too_early | emerging | active | saturated
      market_timing: { type: Sequelize.STRING(40), allowNull: true },
      // 0.000 - 1.000: how shippable this is for a small team.
      buildability_score: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      // Qualitative band: low | medium | high | very_high (detail in metadata).
      revenue_potential: { type: Sequelize.STRING(40), allowNull: true },
      mvp_scope: { type: Sequelize.TEXT, allowNull: true },
      gtm_summary: { type: Sequelize.TEXT, allowNull: true },
      // { suggested_architecture, target_customers, revenue_detail, ... }
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('venture_ideas', ['report_id'], { name: 'idx_venture_ideas_report' });

    // ---- project_generation_jobs ---------------------------------------
    await queryInterface.createTable('project_generation_jobs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // Denormalized for convenient report-scoped lookups.
      report_id: { type: Sequelize.INTEGER, allowNull: true },
      // queued | running | success | failed
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'queued' },
      progress_percent: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      current_phase: { type: Sequelize.STRING(80), allowNull: true },
      // Array of { key, label, status, started_at, completed_at } — phase log.
      phases: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      project_slug: { type: Sequelize.STRING(160), allowNull: true },
      // The Agent Foundry project URL once the handoff lands (foundation: stub).
      architect_url: { type: Sequelize.STRING(500), allowNull: true },
      // Generated requirements payload (foundation: produced by the bridge stub).
      requirements_json: { type: Sequelize.JSONB, allowNull: true },
      error: { type: Sequelize.TEXT, allowNull: true },
      created_by: { type: Sequelize.INTEGER, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('project_generation_jobs', ['venture_idea_id'], { name: 'idx_project_jobs_venture' });
    await queryInterface.addIndex('project_generation_jobs', ['status'], { name: 'idx_project_jobs_status' });

    // ---- daily_research_scans ------------------------------------------
    await queryInterface.createTable('daily_research_scans', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      scan_topic: { type: Sequelize.STRING(200), allowNull: false },
      // Null until the scan produces a report.
      report_id: { type: Sequelize.INTEGER, allowNull: true },
      // running | success | failed | skipped
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'running' },
      error: { type: Sequelize.TEXT, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('daily_research_scans', ['created_at'], { name: 'idx_daily_research_scans_created' });
    await queryInterface.addIndex('daily_research_scans', ['scan_topic'], { name: 'idx_daily_research_scans_topic' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('daily_research_scans');
    await queryInterface.dropTable('project_generation_jobs');
    await queryInterface.dropTable('venture_ideas');
    await queryInterface.dropTable('deep_research_reports');
  },
};
