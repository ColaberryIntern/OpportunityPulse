'use strict';

// Deep Research Intelligence Engine — Phase 4 schema (Portfolio Intelligence).
//
// Eight new tables. Phase 4 evolves the platform from "can this venture
// succeed?" to "should this venture consume organizational capacity right
// now?" — portfolio-wide capacity, prioritization, dependencies, ROI,
// templates, and confidence decay. Every table is additive; nothing in the
// Phase 1-3 schema is touched.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- portfolio_scores ---------------------------------------------
    // The portfolio prioritization engine's output. One row per venture per
    // refresh run; rank is the engine's recommended execution order.
    await queryInterface.createTable('portfolio_scores', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      portfolio_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      portfolio_rank: { type: Sequelize.INTEGER, allowNull: true },
      sequencing_recommendation: { type: Sequelize.STRING(40), allowNull: true },
      // The factor breakdown — the explainable scoring backing the rank.
      factors: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      run_id: { type: Sequelize.STRING(60), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('portfolio_scores', ['venture_idea_id'], { name: 'idx_portfolio_scores_venture' });
    await queryInterface.addIndex('portfolio_scores', ['run_id'], { name: 'idx_portfolio_scores_run' });

    // ---- resource_capacity_snapshots ----------------------------------
    // Time-series snapshot of organizational capacity pressure.
    await queryInterface.createTable('resource_capacity_snapshots', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 0-100 — higher = more pressure (more demand than supply).
      staffing_pressure: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      infra_pressure: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // How many ventures can realistically run in parallel right now.
      concurrency_limit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Active venture count contributing to the pressure.
      active_ventures: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      build_now_ventures: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // { roles: { tech_lead: { demand: N, supply: M, deficit: D }, ... } }
      role_demand: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // Array of { type, label, severity } bottleneck records.
      bottlenecks: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('resource_capacity_snapshots', ['created_at'], { name: 'idx_resource_capacity_snapshots_created' });

    // ---- venture_dependencies -----------------------------------------
    // Edges in the venture dependency graph. Three flavors carry distinct
    // dependency_type values: 'shared_architecture', 'shared_staffing',
    // 'shared_ai_provider'.
    await queryInterface.createTable('venture_dependencies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // The other venture this one depends on / shares with.
      related_venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      dependency_type: { type: Sequelize.STRING(40), allowNull: false },
      // 0-100 — risk if the dependency fails / the cost of running both at once.
      risk_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // { shared_components: [...], shared_roles: [...], reasoning: '...' }
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('venture_dependencies', ['venture_idea_id'], { name: 'idx_venture_dependencies_venture' });
    await queryInterface.addConstraint('venture_dependencies', {
      fields: ['venture_idea_id', 'related_venture_idea_id', 'dependency_type'],
      type: 'unique',
      name: 'uq_venture_dependencies_edge',
    });

    // ---- infrastructure_overlap ---------------------------------------
    // One row per (venture_a, venture_b) pair where shared components were
    // detected — the shared-build opportunity surface.
    await queryInterface.createTable('infrastructure_overlap', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_a_id: { type: Sequelize.INTEGER, allowNull: false },
      venture_b_id: { type: Sequelize.INTEGER, allowNull: false },
      // 0-1 — how much of the build is genuinely shared.
      overlap_score: { type: Sequelize.DECIMAL(4, 3), allowNull: false, defaultValue: 0 },
      // Array of shared component descriptors.
      shared_components: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('infrastructure_overlap', {
      fields: ['venture_a_id', 'venture_b_id'],
      type: 'unique',
      name: 'uq_infrastructure_overlap_pair',
    });

    // ---- roi_forecasts -------------------------------------------------
    // ROI forecast rows. scope='venture' for per-venture; scope='portfolio'
    // for the rolled-up portfolio view. Each scenario gets its own row.
    await queryInterface.createTable('roi_forecasts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: true },
      scope: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'venture' },
      // optimistic | realistic | conservative
      scenario: { type: Sequelize.STRING(20), allowNull: false },
      projected_mrr: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      implementation_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      staffing_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      infra_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      breakeven_months: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      // 12-month ROI as a ratio (e.g. 1.4 = 140% return).
      projected_roi_12mo: { type: Sequelize.DECIMAL(6, 3), allowNull: true },
      // { assumptions: {...}, methodology: '...' }
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      run_id: { type: Sequelize.STRING(60), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('roi_forecasts', ['venture_idea_id'], { name: 'idx_roi_forecasts_venture' });
    await queryInterface.addIndex('roi_forecasts', ['run_id'], { name: 'idx_roi_forecasts_run' });

    // ---- confidence_history -------------------------------------------
    // Time series of computed confidence per venture — drives decay analysis.
    await queryInterface.createTable('confidence_history', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // 0-1 confidence at this snapshot.
      confidence: { type: Sequelize.DECIMAL(4, 3), allowNull: false, defaultValue: 0 },
      // { age_days, signal_strength, hiring_velocity, ... } — the inputs to the decay calc.
      factors: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('confidence_history', ['venture_idea_id'], { name: 'idx_confidence_history_venture' });
    await queryInterface.addIndex('confidence_history', ['computed_at'], { name: 'idx_confidence_history_computed' });

    // ---- reassessment_events -------------------------------------------
    // Recommendations the confidence-decay engine emits. CRUCIALLY: these
    // are recommendations only — the system NEVER auto-transitions, never
    // auto-builds, never auto-anything. A human decides.
    await queryInterface.createTable('reassessment_events', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // reassess | reprioritize | accelerate | monitor
      recommendation_type: { type: Sequelize.STRING(40), allowNull: false },
      // pending | acknowledged | dismissed
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      // 0-100 — how strongly the engine recommends this action.
      severity: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      reason: { type: Sequelize.TEXT, allowNull: true },
      factors: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      acknowledged_by: { type: Sequelize.STRING(120), allowNull: true },
      acknowledged_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('reassessment_events', ['venture_idea_id'], { name: 'idx_reassessment_events_venture' });
    await queryInterface.addIndex('reassessment_events', ['status'], { name: 'idx_reassessment_events_status' });

    // ---- venture_templates --------------------------------------------
    // Detected venture patterns + their reusable scaffolds + playbooks.
    await queryInterface.createTable('venture_templates', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      template_key: { type: Sequelize.STRING(60), allowNull: false },
      label: { type: Sequelize.STRING(160), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      // The MVP scaffold (features, stack, AI components, staffing).
      mvp_scaffold: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // The GTM playbook (channels, pricing, pilot strategy).
      gtm_playbook: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // The venture idea ids currently matching this template.
      applicable_to: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('venture_templates', {
      fields: ['template_key'],
      type: 'unique',
      name: 'uq_venture_templates_key',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('venture_templates');
    await queryInterface.dropTable('reassessment_events');
    await queryInterface.dropTable('confidence_history');
    await queryInterface.dropTable('roi_forecasts');
    await queryInterface.dropTable('infrastructure_overlap');
    await queryInterface.dropTable('venture_dependencies');
    await queryInterface.dropTable('resource_capacity_snapshots');
    await queryInterface.dropTable('portfolio_scores');
  },
};
