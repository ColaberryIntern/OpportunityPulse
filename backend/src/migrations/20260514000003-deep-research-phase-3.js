'use strict';

// Deep Research Intelligence Engine — Phase 3 schema (Execution Intelligence).
//
// Six new tables + lifecycle columns. Phase 3 operationalizes the
// intelligence layer: a venture idea now has a lifecycle, an execution
// readiness assessment, an MVP plan, a launch strategy, a deployment
// readiness level, and a place in the execution queue.
//
//   venture_lifecycle_events  — the audit trail of every lifecycle transition.
//   execution_readiness       — "can Colaberry realistically execute this?" —
//                               deterministic readiness scoring + rationale.
//   mvp_plans                 — structured MVP plans (scope, phases, stack,
//                               timeline, AI components, staffing).
//   launch_strategies         — ICP / GTM / pricing / pilot / enterprise / gov
//                               go-to-market strategy.
//   deployment_readiness      — prototype / mvp / production / enterprise
//                               readiness classification.
//   execution_queue_items     — the venture operations queue row.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- venture_lifecycle_events -------------------------------------
    await queryInterface.createTable('venture_lifecycle_events', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      from_state: { type: Sequelize.STRING(40), allowNull: true },
      to_state: { type: Sequelize.STRING(40), allowNull: false },
      actor: { type: Sequelize.STRING(120), allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('venture_lifecycle_events', ['venture_idea_id'], { name: 'idx_venture_lifecycle_events_venture' });

    // ---- execution_readiness ------------------------------------------
    await queryInterface.createTable('execution_readiness', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // 0-100 weighted composite.
      execution_readiness_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // Estimated MVP delivery time in weeks.
      mvp_timeline_weeks: { type: Sequelize.INTEGER, allowNull: true },
      // 0-100 sub-scores (higher = more ready / lower risk).
      technical_complexity: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      ai_dependency_risk: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      market_readiness: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      operational_readiness: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      // { roles: [...], headcount, infrastructure: [...] }
      staffing: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      infrastructure: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // The full 0-100 sub-score breakdown + the rationale string.
      breakdown: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('execution_readiness', ['venture_idea_id'], { name: 'idx_execution_readiness_venture' });

    // ---- mvp_plans -----------------------------------------------------
    await queryInterface.createTable('mvp_plans', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      mvp_scope: { type: Sequelize.TEXT, allowNull: true },
      // Arrays of short strings.
      phase_1_features: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      fast_launch_features: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      future_roadmap: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      suggested_architecture: { type: Sequelize.TEXT, allowNull: true },
      suggested_stack: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      recommended_ai_components: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // { roles: [...], headcount }
      staffing: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      estimated_timeline_weeks: { type: Sequelize.INTEGER, allowNull: true },
      generated_by: { type: Sequelize.STRING(60), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('mvp_plans', ['venture_idea_id'], { name: 'idx_mvp_plans_venture' });

    // ---- launch_strategies --------------------------------------------
    await queryInterface.createTable('launch_strategies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      icp: { type: Sequelize.TEXT, allowNull: true },
      gtm: { type: Sequelize.TEXT, allowNull: true },
      landing_page: { type: Sequelize.TEXT, allowNull: true },
      outreach: { type: Sequelize.TEXT, allowNull: true },
      // Array of recommended channel strings.
      channels: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      pricing_strategy: { type: Sequelize.TEXT, allowNull: true },
      pilot_strategy: { type: Sequelize.TEXT, allowNull: true },
      enterprise_strategy: { type: Sequelize.TEXT, allowNull: true },
      gov_strategy: { type: Sequelize.TEXT, allowNull: true },
      generated_by: { type: Sequelize.STRING(60), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('launch_strategies', ['venture_idea_id'], { name: 'idx_launch_strategies_venture' });

    // ---- deployment_readiness -----------------------------------------
    await queryInterface.createTable('deployment_readiness', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // prototype | mvp | production | enterprise
      readiness_level: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'prototype' },
      // 0-100 sub-scores.
      requirements_completeness: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      architecture_quality: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      ai_dependency_risk: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      infrastructure_readiness: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      compliance_exposure: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      breakdown: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('deployment_readiness', ['venture_idea_id'], { name: 'idx_deployment_readiness_venture' });

    // ---- execution_queue_items ----------------------------------------
    await queryInterface.createTable('execution_queue_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      venture_idea_id: { type: Sequelize.INTEGER, allowNull: false },
      // Snapshot of the venture's lifecycle state for fast queue queries.
      lifecycle_state: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'discovered' },
      // 0-100 — drives queue ordering. Composite of readiness + decision + score.
      priority_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      owner: { type: Sequelize.STRING(120), allowNull: true },
      // Array of short blocker strings.
      blockers: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('execution_queue_items', {
      fields: ['venture_idea_id'],
      type: 'unique',
      name: 'uq_execution_queue_items_venture',
    });
    await queryInterface.addIndex('execution_queue_items', ['lifecycle_state'], { name: 'idx_execution_queue_items_state' });

    // ---- columns on venture_ideas --------------------------------------
    // The current lifecycle state — the venture_lifecycle_events table is the
    // audit trail; this is the fast-read denormalized current state.
    await queryInterface.addColumn('venture_ideas', 'lifecycle_state', {
      type: Sequelize.STRING(40), allowNull: false, defaultValue: 'discovered',
    });
    await queryInterface.addColumn('venture_ideas', 'lifecycle_owner', {
      type: Sequelize.STRING(120), allowNull: true,
    });

    // ---- columns on project_generation_jobs ----------------------------
    // The remote Agent Foundry job id + which provider produced it
    // ('foundation' = the deterministic scaffold; 'agent_foundry' = the real
    // HTTP integration once AGENT_FOUNDRY_API_URL is configured).
    await queryInterface.addColumn('project_generation_jobs', 'external_job_id', {
      type: Sequelize.STRING(120), allowNull: true,
    });
    await queryInterface.addColumn('project_generation_jobs', 'provider', {
      type: Sequelize.STRING(30), allowNull: false, defaultValue: 'foundation',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('project_generation_jobs', 'provider');
    await queryInterface.removeColumn('project_generation_jobs', 'external_job_id');
    await queryInterface.removeColumn('venture_ideas', 'lifecycle_owner');
    await queryInterface.removeColumn('venture_ideas', 'lifecycle_state');
    await queryInterface.dropTable('execution_queue_items');
    await queryInterface.dropTable('deployment_readiness');
    await queryInterface.dropTable('launch_strategies');
    await queryInterface.dropTable('mvp_plans');
    await queryInterface.dropTable('execution_readiness');
    await queryInterface.dropTable('venture_lifecycle_events');
  },
};
