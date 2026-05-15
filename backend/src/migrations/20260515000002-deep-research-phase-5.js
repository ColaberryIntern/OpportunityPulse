'use strict';

// Deep Research Intelligence Engine — Phase 5 schema (Temporal + Ecosystem
// Intelligence). Eight new tables; nothing in Phases 1-4 is touched.
//
//   temporal_snapshots    — generic key/value time series for any metric
//                           the temporal engine wants to track.
//   ecosystem_metrics     — per-ecosystem health/maturity/momentum over time.
//   venture_trajectories  — per-venture trajectory classifications.
//   decision_accuracy     — measured-only decision quality over time windows.
//   predictive_capacity   — 30/90/180-day capacity forecasts.
//   drift_alerts          — strategic-drift recommendations (human-action only).
//   signal_history        — historical signals snapshotted at each refresh.
//   dependency_edges      — DIRECTIONAL prerequisites (separate from the
//                           Phase 4 venture_dependencies, which is symmetric).

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- temporal_snapshots --------------------------------------------
    await queryInterface.createTable('temporal_snapshots', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // e.g. 'staffing_pressure', 'queue_pressure', 'decision_quality'
      metric_key: { type: Sequelize.STRING(60), allowNull: false },
      metric_value: { type: Sequelize.DECIMAL(10, 3), allowNull: true },
      // 'portfolio' | 'venture' | 'ecosystem'
      scope: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'portfolio' },
      scope_id: { type: Sequelize.INTEGER, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      snapshot_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('temporal_snapshots', ['metric_key', 'snapshot_at'], { name: 'idx_temporal_snapshots_metric_time' });
    await queryInterface.addIndex('temporal_snapshots', ['scope', 'scope_id'], { name: 'idx_temporal_snapshots_scope' });

    // ---- ecosystem_metrics ---------------------------------------------
    await queryInterface.createTable('ecosystem_metrics', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      ecosystem_key: { type: Sequelize.STRING(60), allowNull: false },
      label: { type: Sequelize.STRING(160), allowNull: true },
      venture_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // 0-100 each
      health_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      maturity_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      momentum_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // emerging | accelerating | saturated | declining | dying | converging
      classification: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'emerging' },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('ecosystem_metrics', ['ecosystem_key', 'computed_at'], { name: 'idx_ecosystem_metrics_key_time' });

    // ---- venture_trajectories ------------------------------------------
    await queryInterface.createTable('venture_trajectories', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // strengthening | stable | weakening | stagnating | accelerating | unknown
      classification: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'unknown' },
      score_delta: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      confidence_delta: { type: Sequelize.DECIMAL(5, 3), allowNull: true },
      readiness_delta: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      lifecycle_velocity: { type: Sequelize.DECIMAL(6, 3), allowNull: true },
      period_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('venture_trajectories', ['venture_idea_id', 'computed_at'], { name: 'idx_venture_trajectories_venture' });

    // ---- decision_accuracy ---------------------------------------------
    await queryInterface.createTable('decision_accuracy', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'BUILD_NOW' | 'BUILD_SOON' | 'MONITOR' | ...
      decision_type: { type: Sequelize.STRING(40), allowNull: false },
      period_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 90 },
      total_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      progressed_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      stalled_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      reversed_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // 0.000-1.000
      accuracy: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('decision_accuracy', ['decision_type', 'computed_at'], { name: 'idx_decision_accuracy_type_time' });

    // ---- predictive_capacity -------------------------------------------
    await queryInterface.createTable('predictive_capacity', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      horizon_days: { type: Sequelize.INTEGER, allowNull: false },
      scenario: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'realistic' },
      projected_staffing_pressure: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      projected_queue_pressure: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      projected_concurrency_demand: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      // Array of { type, label, risk_score, eta_days }
      bottleneck_risks: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('predictive_capacity', ['horizon_days', 'computed_at'], { name: 'idx_predictive_capacity_horizon' });

    // ---- drift_alerts --------------------------------------------------
    // Strategic-drift recommendations. ALWAYS recommendations only — never
    // auto-applied. Status: pending → acknowledged | dismissed.
    await queryInterface.createTable('drift_alerts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // ecosystem_overcommitment | risk_concentration | execution_overload |
      // portfolio_imbalance | strategy_drift
      drift_type: { type: Sequelize.STRING(40), allowNull: false },
      severity: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      description: { type: Sequelize.TEXT, allowNull: true },
      // Affected venture ids + ecosystems + portfolio scope.
      related_venture_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      related_ecosystems: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      recommendation: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      acknowledged_by: { type: Sequelize.STRING(120), allowNull: true },
      acknowledged_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('drift_alerts', ['status'], { name: 'idx_drift_alerts_status' });
    await queryInterface.addIndex('drift_alerts', ['drift_type', 'created_at'], { name: 'idx_drift_alerts_type' });

    // ---- signal_history ------------------------------------------------
    await queryInterface.createTable('signal_history', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'correlation_strength' | 'convergence_count' | 'avg_market_stage' | ...
      signal_key: { type: Sequelize.STRING(60), allowNull: false },
      signal_value: { type: Sequelize.DECIMAL(10, 3), allowNull: true },
      scope: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'portfolio' },
      scope_id: { type: Sequelize.INTEGER, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('signal_history', ['signal_key', 'computed_at'], { name: 'idx_signal_history_key_time' });

    // ---- dependency_edges ----------------------------------------------
    // DIRECTIONAL prerequisites (A → B means A blocks B until A ships X).
    // Separate from the symmetric Phase 4 venture_dependencies table.
    await queryInterface.createTable('dependency_edges', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      blocker_venture_id: { type: Sequelize.INTEGER, allowNull: false },
      blocked_venture_id: { type: Sequelize.INTEGER, allowNull: false },
      // shared_component | shared_data | sequencing | shared_team
      dependency_type: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'sequencing' },
      // What needs to ship before the blocked venture can start.
      prerequisite: { type: Sequelize.TEXT, allowNull: true },
      // 0-100 — how badly the blocked venture is stuck if the blocker fails.
      cascade_risk: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // proposed | confirmed | resolved | dismissed
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'proposed' },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('dependency_edges', {
      fields: ['blocker_venture_id', 'blocked_venture_id', 'dependency_type'],
      type: 'unique',
      name: 'uq_dependency_edges_edge',
    });
    await queryInterface.addIndex('dependency_edges', ['blocker_venture_id'], { name: 'idx_dependency_edges_blocker' });
    await queryInterface.addIndex('dependency_edges', ['blocked_venture_id'], { name: 'idx_dependency_edges_blocked' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dependency_edges');
    await queryInterface.dropTable('signal_history');
    await queryInterface.dropTable('drift_alerts');
    await queryInterface.dropTable('predictive_capacity');
    await queryInterface.dropTable('decision_accuracy');
    await queryInterface.dropTable('venture_trajectories');
    await queryInterface.dropTable('ecosystem_metrics');
    await queryInterface.dropTable('temporal_snapshots');
  },
};
