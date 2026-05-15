'use strict';

// Deep Research Intelligence Engine — Phase 8 schema (Pursuit Activation +
// Strategic Capture Intelligence). Eight new tables; nothing in earlier
// phases is touched. All measure-only — no auto-submit / auto-bid / auto-
// launch state lives in these tables.
//
//   pursuit_activations         — audit of pursuit-activation events.
//   review_queue_handoffs       — audit of pursuit → actionGenerator drafts.
//   proposal_readiness_scores   — per-pursuit readiness scoring snapshots.
//   venture_conflicts           — venture-idea ↔ existing-tool overlap.
//   capture_strategies          — composed capture-plan snapshots.
//   opportunity_expansions      — cached expansion sets per anchor.
//   research_revenue_links      — research signal → revenue/procurement map.
//   submission_readiness_artifacts — foundations for the future submission
//                                    readiness engine. Asset model only.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- pursuit_activations -----------------------------------------
    await queryInterface.createTable('pursuit_activations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: false },
      // 'cluster' | 'pattern' | 'agency' | 'technology' | 'opportunity_group' |
      // 'ecosystem' | 'venture' | 'research_run' | 'manual'
      source_kind: { type: Sequelize.STRING(30), allowNull: false },
      source_id: { type: Sequelize.STRING(200), allowNull: true },
      // How many of each artifact was attached at activation time.
      attached_counts: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      actor: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('pursuit_activations', ['pursuit_id'], { name: 'idx_pursuit_activations_pursuit' });
    await queryInterface.addIndex('pursuit_activations', ['source_kind'], { name: 'idx_pursuit_activations_source' });

    // ---- review_queue_handoffs --------------------------------------
    await queryInterface.createTable('review_queue_handoffs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: false },
      opportunity_id: { type: Sequelize.INTEGER, allowNull: false },
      output_id: { type: Sequelize.INTEGER, allowNull: true },
      output_type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'proposal' },
      // 'pending' | 'success' | 'failed' | 'skipped'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      actor: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      completed_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('review_queue_handoffs', ['pursuit_id'], { name: 'idx_rq_handoffs_pursuit' });
    await queryInterface.addIndex('review_queue_handoffs', ['status'], { name: 'idx_rq_handoffs_status' });

    // ---- proposal_readiness_scores ----------------------------------
    await queryInterface.createTable('proposal_readiness_scores', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'pursuit' | 'opportunity'
      scope_kind: { type: Sequelize.STRING(20), allowNull: false },
      scope_id: { type: Sequelize.INTEGER, allowNull: false },
      // 0-100 composite + per-dimension factors.
      composite_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // 'ready' | 'needs_prep' | 'blocked' | 'unknown'
      classification: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'unknown' },
      staffing_readiness: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      capability_readiness: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      compliance_readiness: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      asset_readiness: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      dependency_readiness: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      acceleration_pct: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      submission_risk: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      expected_effort_hours: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      blockers: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      accelerators: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('proposal_readiness_scores', ['scope_kind', 'scope_id'], { name: 'idx_pr_scope' });

    // ---- venture_conflicts ------------------------------------------
    await queryInterface.createTable('venture_conflicts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // Matched AiTool.id.
      ai_tool_id: { type: Sequelize.INTEGER, allowNull: false },
      // 'category_overlap' | 'feature_overlap' | 'semantic_overlap' |
      // 'ecosystem_overlap'
      conflict_type: { type: Sequelize.STRING(30), allowNull: false },
      severity: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      matched_terms: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      differentiation_hints: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('venture_conflicts', ['venture_idea_id'], { name: 'idx_vconflict_venture' });
    await queryInterface.addIndex('venture_conflicts', ['ai_tool_id'], { name: 'idx_vconflict_tool' });

    // ---- capture_strategies -----------------------------------------
    await queryInterface.createTable('capture_strategies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'pursuit' | 'opportunity' | 'agency'
      scope_kind: { type: Sequelize.STRING(20), allowNull: false },
      scope_id: { type: Sequelize.INTEGER, allowNull: true },
      scope_value: { type: Sequelize.STRING(200), allowNull: true },
      evaluator_priorities: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      agency_pain_points: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      differentiators: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      positioning_recommendations: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      incumbent_risks: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      partnership_opportunities: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      reusable_language: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      recurring_themes: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      narrative: { type: Sequelize.TEXT, allowNull: true },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('capture_strategies', ['scope_kind', 'scope_id'], { name: 'idx_capture_scope' });

    // ---- opportunity_expansions -------------------------------------
    await queryInterface.createTable('opportunity_expansions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'cluster' | 'agency' | 'technology' | 'research_run' | 'pattern' |
      // 'opportunity'
      anchor_kind: { type: Sequelize.STRING(30), allowNull: false },
      anchor_id: { type: Sequelize.STRING(200), allowNull: false },
      // Cached expansion result with capped lists for the UI.
      related_opportunities: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      adjacent_agencies: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      adjacent_technologies: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      recurring_naics: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      future_signals: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('opportunity_expansions', ['anchor_kind', 'anchor_id'], { name: 'idx_oexpansion_anchor' });

    // ---- research_revenue_links -------------------------------------
    await queryInterface.createTable('research_revenue_links', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'research' | 'ecosystem' | 'hiring' | 'funding' | 'pattern'
      signal_kind: { type: Sequelize.STRING(30), allowNull: false },
      signal_id: { type: Sequelize.STRING(200), allowNull: true },
      signal_label: { type: Sequelize.STRING(300), allowNull: false },
      revenue_opportunity_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      target_agencies: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      procurement_themes: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      implementation_demand: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      strength: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('research_revenue_links', ['signal_kind'], { name: 'idx_rr_signal_kind' });

    // ---- submission_readiness_artifacts -----------------------------
    // FOUNDATIONS ONLY. Per the Phase 8 spec — do not build the full
    // submission engine yet. Track required artifacts so future Phase 9
    // work has a place to land.
    await queryInterface.createTable('submission_readiness_artifacts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      opportunity_id: { type: Sequelize.INTEGER, allowNull: true },
      // 'capability_statement' | 'past_performance' | 'staffing_plan' |
      // 'pricing_table' | 'compliance_matrix' | 'attachment' | 'other'
      artifact_kind: { type: Sequelize.STRING(40), allowNull: false },
      label: { type: Sequelize.STRING(200), allowNull: false },
      // 'missing' | 'in_progress' | 'ready' | 'reviewed'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'missing' },
      required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      content_ref: { type: Sequelize.STRING(500), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('submission_readiness_artifacts', ['pursuit_id'], { name: 'idx_sra_pursuit' });
    await queryInterface.addIndex('submission_readiness_artifacts', ['opportunity_id'], { name: 'idx_sra_opp' });
    await queryInterface.addIndex('submission_readiness_artifacts', ['artifact_kind', 'status'], { name: 'idx_sra_kind_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('submission_readiness_artifacts');
    await queryInterface.dropTable('research_revenue_links');
    await queryInterface.dropTable('opportunity_expansions');
    await queryInterface.dropTable('capture_strategies');
    await queryInterface.dropTable('venture_conflicts');
    await queryInterface.dropTable('proposal_readiness_scores');
    await queryInterface.dropTable('review_queue_handoffs');
    await queryInterface.dropTable('pursuit_activations');
  },
};
