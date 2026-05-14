'use strict';

// Deep Research Intelligence Engine — Phase 2 schema.
//
// Five new tables + scoring/management columns on the Phase 1 tables:
//
//   report_versions       — immutable snapshots so a re-run preserves history.
//   signal_correlations   — the cross-channel correlation engine's output:
//                           convergence type, strength, acceleration, the
//                           per-channel signal breakdown + supporting evidence.
//   monetization_models   — the monetization engine's output: one row per
//                           (report, model_type) — SaaS / enterprise / gov /
//                           education / services / marketplace.
//   ai_provider_logs      — every AI call attempt: provider, model, status,
//                           attempt #, duration, tokens, error class. The
//                           observability substrate for the retry manager.
//   briefing_subscriptions— DB-driven scan config for the briefing center:
//                           topic, frequency, recipients, enabled.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- report_versions ----------------------------------------------
    await queryInterface.createTable('report_versions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      report_id: { type: Sequelize.INTEGER, allowNull: false },
      version: { type: Sequelize.INTEGER, allowNull: false },
      // Full immutable snapshot of the report + venture ideas at this version.
      snapshot: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('report_versions', ['report_id'], { name: 'idx_report_versions_report' });
    await queryInterface.addConstraint('report_versions', {
      fields: ['report_id', 'version'],
      type: 'unique',
      name: 'uq_report_versions_report_version',
    });

    // ---- signal_correlations ------------------------------------------
    await queryInterface.createTable('signal_correlations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      report_id: { type: Sequelize.INTEGER, allowNull: false },
      // 0.000-1.000 — how strongly the channels reinforce each other.
      correlation_strength: { type: Sequelize.DECIMAL(4, 3), allowNull: false, defaultValue: 0 },
      // 0.000-2.000+ — recent-vs-prior signal volume ratio across channels.
      acceleration: { type: Sequelize.DECIMAL(5, 3), allowNull: false, defaultValue: 1 },
      // commercial_acceleration | procurement_pull | talent_convergence |
      // capital_convergence | research_only | diffuse | none
      convergence_type: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'none' },
      // Per-channel { channel, volume, recency, value, signal_score }.
      signal_breakdown: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Short human-readable evidence strings.
      supporting_evidence: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('signal_correlations', ['report_id'], { name: 'idx_signal_correlations_report' });

    // ---- monetization_models ------------------------------------------
    await queryInterface.createTable('monetization_models', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      report_id: { type: Sequelize.INTEGER, allowNull: false },
      // saas | enterprise | government | education | services | marketplace
      model_type: { type: Sequelize.STRING(30), allowNull: false },
      pricing_suggestion: { type: Sequelize.TEXT, allowNull: true },
      ideal_icp: { type: Sequelize.TEXT, allowNull: true },
      revenue_model: { type: Sequelize.TEXT, allowNull: true },
      // low | medium | high
      implementation_complexity: { type: Sequelize.STRING(20), allowNull: true },
      // 0.000-1.000 — how well this model fits the report's signal profile.
      fit_score: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('monetization_models', ['report_id'], { name: 'idx_monetization_models_report' });

    // ---- ai_provider_logs ---------------------------------------------
    await queryInterface.createTable('ai_provider_logs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      provider: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'openai' },
      operation: { type: Sequelize.STRING(60), allowNull: true },
      model: { type: Sequelize.STRING(60), allowNull: true },
      // success | failure
      status: { type: Sequelize.STRING(20), allowNull: false },
      attempt: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      duration_ms: { type: Sequelize.INTEGER, allowNull: true },
      tokens_used: { type: Sequelize.INTEGER, allowNull: true },
      // rate_limit | auth | server | network | bad_response | other
      error_class: { type: Sequelize.STRING(30), allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('ai_provider_logs', ['created_at'], { name: 'idx_ai_provider_logs_created' });
    await queryInterface.addIndex('ai_provider_logs', ['status'], { name: 'idx_ai_provider_logs_status' });

    // ---- briefing_subscriptions ---------------------------------------
    await queryInterface.createTable('briefing_subscriptions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      scan_topic: { type: Sequelize.STRING(200), allowNull: false },
      // daily | weekly
      frequency: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'daily' },
      // JSON array of email recipient strings.
      recipients: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      last_scan_at: { type: Sequelize.DATE, allowNull: true },
      created_by: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('briefing_subscriptions', ['enabled'], { name: 'idx_briefing_subscriptions_enabled' });

    // ---- columns on deep_research_reports ------------------------------
    await queryInterface.addColumn('deep_research_reports', 'version', {
      type: Sequelize.INTEGER, allowNull: false, defaultValue: 1,
    });
    await queryInterface.addColumn('deep_research_reports', 'is_favorite', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
    });
    await queryInterface.addColumn('deep_research_reports', 'is_archived', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
    });
    // 0.000-1.000 — deterministic market-timing engine score.
    await queryInterface.addColumn('deep_research_reports', 'timing_score', {
      type: Sequelize.DECIMAL(4, 3), allowNull: true,
    });
    // 0-100 — mean venture composite score across the report's ideas.
    await queryInterface.addColumn('deep_research_reports', 'commercialization_score', {
      type: Sequelize.DECIMAL(5, 2), allowNull: true,
    });
    // 0.000-1.000 — cross-channel correlation strength (denormalized for the index page).
    await queryInterface.addColumn('deep_research_reports', 'correlation_strength', {
      type: Sequelize.DECIMAL(4, 3), allowNull: true,
    });

    // ---- columns on venture_ideas --------------------------------------
    // 0-100 weighted composite from the venture scoring engine.
    await queryInterface.addColumn('venture_ideas', 'composite_score', {
      type: Sequelize.DECIMAL(5, 2), allowNull: true,
    });
    // strong_build | build | watch | pass
    await queryInterface.addColumn('venture_ideas', 'recommendation_level', {
      type: Sequelize.STRING(20), allowNull: true,
    });
    // The 8-dimension score breakdown { commercialization, buildability, ... }.
    await queryInterface.addColumn('venture_ideas', 'scores', {
      type: Sequelize.JSONB, allowNull: false, defaultValue: {},
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('venture_ideas', 'scores');
    await queryInterface.removeColumn('venture_ideas', 'recommendation_level');
    await queryInterface.removeColumn('venture_ideas', 'composite_score');
    await queryInterface.removeColumn('deep_research_reports', 'correlation_strength');
    await queryInterface.removeColumn('deep_research_reports', 'commercialization_score');
    await queryInterface.removeColumn('deep_research_reports', 'timing_score');
    await queryInterface.removeColumn('deep_research_reports', 'is_archived');
    await queryInterface.removeColumn('deep_research_reports', 'is_favorite');
    await queryInterface.removeColumn('deep_research_reports', 'version');
    await queryInterface.dropTable('briefing_subscriptions');
    await queryInterface.dropTable('ai_provider_logs');
    await queryInterface.dropTable('monetization_models');
    await queryInterface.dropTable('signal_correlations');
    await queryInterface.dropTable('report_versions');
  },
};
