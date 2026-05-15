'use strict';

// Deep Research Intelligence Engine — Phase 6 schema (Adaptive Strategic
// Operations). Eight new tables; nothing in Phases 1-5 is touched.
//
//   adaptive_refresh_runs       — one row per scheduled refresh run.
//   refresh_history             — per-step audit log (drills into a run).
//   intervention_recommendations — exec interventions (hire / pause /
//                                   redistribute / sequence / diversify).
//   strategic_recommendations   — portfolio-level strategic recommendations.
//   venture_health_history      — per-venture health classification over time.
//   forecast_accuracy           — predicted-vs-actual comparison rows.
//   operational_drift           — operational drift alerts.
//   dependency_reviews          — review workflow events on dependency_edges.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- adaptive_refresh_runs ----------------------------------------
    await queryInterface.createTable('adaptive_refresh_runs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'portfolio' | 'observatory' | 'decay' | 'full'
      run_type: { type: Sequelize.STRING(40), allowNull: false },
      // 'running' | 'success' | 'partial' | 'failed'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'running' },
      duration_ms: { type: Sequelize.INTEGER, allowNull: true },
      step_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      error_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // 'cron' | 'manual'
      trigger: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'cron' },
      results: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      errors: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      started_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      completed_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('adaptive_refresh_runs', ['started_at'], { name: 'idx_adaptive_refresh_runs_started' });
    await queryInterface.addIndex('adaptive_refresh_runs', ['status'], { name: 'idx_adaptive_refresh_runs_status' });

    // ---- refresh_history ----------------------------------------------
    await queryInterface.createTable('refresh_history', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      run_id: { type: Sequelize.INTEGER, allowNull: false },
      step_name: { type: Sequelize.STRING(60), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false },
      duration_ms: { type: Sequelize.INTEGER, allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('refresh_history', ['run_id'], { name: 'idx_refresh_history_run' });

    // ---- intervention_recommendations --------------------------------
    await queryInterface.createTable('intervention_recommendations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // hire | redistribute | venture_pause | queue_pressure | sequencing |
      // ecosystem_diversification
      intervention_type: { type: Sequelize.STRING(40), allowNull: false },
      severity: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      title: { type: Sequelize.STRING(200), allowNull: false },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      // Supporting metrics + the data points that drove the recommendation.
      supporting_metrics: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      related_venture_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // pending | acknowledged | dismissed
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      acknowledged_by: { type: Sequelize.STRING(120), allowNull: true },
      acknowledged_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('intervention_recommendations', ['status'], { name: 'idx_intervention_recs_status' });
    await queryInterface.addIndex('intervention_recommendations', ['intervention_type'], { name: 'idx_intervention_recs_type' });

    // ---- strategic_recommendations -----------------------------------
    await queryInterface.createTable('strategic_recommendations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // portfolio_rebalance | execution_pacing | infrastructure_consolidation |
      // venture_acceleration | monitoring
      recommendation_type: { type: Sequelize.STRING(40), allowNull: false },
      severity: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      title: { type: Sequelize.STRING(200), allowNull: false },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      supporting_metrics: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      related_venture_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      acknowledged_by: { type: Sequelize.STRING(120), allowNull: true },
      acknowledged_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('strategic_recommendations', ['status'], { name: 'idx_strategic_recs_status' });

    // ---- venture_health_history --------------------------------------
    await queryInterface.createTable('venture_health_history', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // healthy | strengthening | at_risk | overloaded | stagnating | declining
      health_classification: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'healthy' },
      // 0-100 composite
      health_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // The breakdown of which signals drove the classification.
      signals: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      suggested_intervention: { type: Sequelize.TEXT, allowNull: true },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('venture_health_history', ['venture_idea_id', 'computed_at'], { name: 'idx_venture_health_history_venture' });

    // ---- forecast_accuracy -------------------------------------------
    await queryInterface.createTable('forecast_accuracy', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // readiness | timeline | staffing | roi
      forecast_kind: { type: Sequelize.STRING(40), allowNull: false },
      scope: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'portfolio' },
      scope_id: { type: Sequelize.INTEGER, allowNull: true },
      predicted_value: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
      actual_value: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
      delta_absolute: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
      delta_fraction: { type: Sequelize.DECIMAL(6, 3), allowNull: true },
      // accurate | optimistic | pessimistic | unknown
      classification: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'unknown' },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('forecast_accuracy', ['forecast_kind', 'computed_at'], { name: 'idx_forecast_accuracy_kind' });

    // ---- operational_drift ------------------------------------------
    // Distinct from Phase 5 drift_alerts (strategic). This is operational:
    // queue drift, execution slowdown, staffing imbalance, dependency
    // accumulation, execution bottlenecks.
    await queryInterface.createTable('operational_drift', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // queue_drift | execution_slowdown | staffing_imbalance |
      // dependency_accumulation | execution_bottleneck
      drift_type: { type: Sequelize.STRING(40), allowNull: false },
      severity: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      description: { type: Sequelize.TEXT, allowNull: true },
      mitigation: { type: Sequelize.TEXT, allowNull: true },
      supporting_metrics: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      related_venture_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      acknowledged_by: { type: Sequelize.STRING(120), allowNull: true },
      acknowledged_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('operational_drift', ['status'], { name: 'idx_operational_drift_status' });
    await queryInterface.addIndex('operational_drift', ['drift_type', 'created_at'], { name: 'idx_operational_drift_type' });

    // ---- dependency_reviews ------------------------------------------
    // Workflow log on Phase 5 dependency_edges: approve/reject/annotate/
    // assign-owner/mark-resolved.
    await queryInterface.createTable('dependency_reviews', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      dependency_edge_id: { type: Sequelize.INTEGER, allowNull: false },
      // approve | reject | annotate | assign_owner | resolve
      action: { type: Sequelize.STRING(30), allowNull: false },
      owner: { type: Sequelize.STRING(120), allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      actor: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('dependency_reviews', ['dependency_edge_id'], { name: 'idx_dependency_reviews_edge' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dependency_reviews');
    await queryInterface.dropTable('operational_drift');
    await queryInterface.dropTable('forecast_accuracy');
    await queryInterface.dropTable('venture_health_history');
    await queryInterface.dropTable('strategic_recommendations');
    await queryInterface.dropTable('intervention_recommendations');
    await queryInterface.dropTable('refresh_history');
    await queryInterface.dropTable('adaptive_refresh_runs');
  },
};
