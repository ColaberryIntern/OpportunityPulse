'use strict';

// Deep Research Phase 15 — quality automation + visual operational intelligence.

const DEFAULT_ORG_ID = Number(process.env.DEEP_RESEARCH_DEFAULT_ORG_ID) || 1;

module.exports = {
  async up(qi, Sequelize) {
    const { DataTypes } = Sequelize;

    // 1) quality_snapshots — single-row consolidated quality state for an output.
    await qi.createTable('quality_snapshots', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      opportunity_output_id: { type: DataTypes.INTEGER, allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      proposal_quality_id: { type: DataTypes.BIGINT, allowNull: true },
      groundedness_id: { type: DataTypes.BIGINT, allowNull: true },
      coherence_id: { type: DataTypes.BIGINT, allowNull: true },
      alignment_id: { type: DataTypes.BIGINT, allowNull: true },
      composite_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      groundedness_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      coherence_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      classification: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unscored' },
      run_trigger: { type: DataTypes.STRING(64), allowNull: true },
      run_status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'completed' },
      run_duration_ms: { type: DataTypes.INTEGER, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('quality_snapshots', ['organization_id', 'computed_at'], { name: 'qs_org_idx' });
    await qi.addIndex('quality_snapshots', ['opportunity_output_id'], { name: 'qs_output_idx' });

    // 2) qa_workflows — quality review assignments + remediation lifecycle.
    await qi.createTable('qa_workflows', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      workflow_kind: { type: DataTypes.STRING(64), allowNull: false },
      opportunity_output_id: { type: DataTypes.INTEGER, allowNull: true },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      quality_alert_id: { type: DataTypes.INTEGER, allowNull: true },
      assignee_user_id: { type: DataTypes.INTEGER, allowNull: true },
      assignee_email: { type: DataTypes.STRING(255), allowNull: true },
      severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
      due_at: { type: DataTypes.DATE, allowNull: true },
      assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      acknowledged_at: { type: DataTypes.DATE, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      reviewer_notes: { type: DataTypes.TEXT, allowNull: true },
      remediation_summary: { type: DataTypes.TEXT, allowNull: true },
      override_reason: { type: DataTypes.TEXT, allowNull: true },
      history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('qa_workflows', ['organization_id', 'status'], { name: 'qaw_org_idx' });
    await qi.addIndex('qa_workflows', ['assignee_user_id', 'status'], { name: 'qaw_assignee_idx' });
    await qi.addIndex('qa_workflows', ['opportunity_output_id'], { name: 'qaw_output_idx' });

    // 3) lineage_visualizations — pre-computed BFS graph payloads for the UI.
    await qi.createTable('lineage_visualizations', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      seed_kind: { type: DataTypes.STRING(64), allowNull: false },
      seed_id: { type: DataTypes.STRING(128), allowNull: false },
      max_depth: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
      node_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      edge_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      generated_by: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('lineage_visualizations', ['seed_kind', 'seed_id'], { name: 'lv_seed_idx' });

    // 4) replay_timeline_views — saved replay timeline filter sets.
    await qi.createTable('replay_timeline_views', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      replay_scope: { type: DataTypes.STRING(64), allowNull: false },
      scope_id: { type: DataTypes.STRING(128), allowNull: false },
      filters: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      event_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      span_seconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      generated_by: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('replay_timeline_views', ['replay_scope', 'scope_id'], { name: 'rtv_scope_idx' });

    // 5) quality_trends — periodic per-tenant quality trend snapshots.
    await qi.createTable('quality_trends', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      window_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
      avg_quality_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_groundedness_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_coherence_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      open_alerts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      quality_delta_vs_prior: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      direction: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'flat' },
      degradation_warnings: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      improvement_insights: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      computed_inputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      captured_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('quality_trends', ['organization_id', 'captured_at'], { name: 'qt_org_idx' });

    // 6) qa_assignments — explicit assignment events (separate from qa_workflows
    // history for fast assignee-workload aggregation).
    await qi.createTable('qa_assignments', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      qa_workflow_id: { type: DataTypes.INTEGER, allowNull: false },
      action: { type: DataTypes.STRING(32), allowNull: false },
      from_user_id: { type: DataTypes.INTEGER, allowNull: true },
      from_email: { type: DataTypes.STRING(255), allowNull: true },
      to_user_id: { type: DataTypes.INTEGER, allowNull: true },
      to_email: { type: DataTypes.STRING(255), allowNull: true },
      assigned_by: { type: DataTypes.STRING(255), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('qa_assignments', ['qa_workflow_id'], { name: 'qa_assign_wf_idx' });
    await qi.addIndex('qa_assignments', ['to_user_id'], { name: 'qa_assign_to_idx' });

    // 7) operational_intelligence — Operations Intelligence Center snapshots.
    await qi.createTable('operational_intelligence', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      overall_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      quality_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lineage_integrity_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      qa_workflow_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      governance_health_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      trend_direction: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'flat' },
      computed_inputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('operational_intelligence', ['organization_id', 'created_at'], { name: 'oi_org_idx' });

    // 8) quality_alert_history — append-only operator actions on quality_alerts.
    await qi.createTable('quality_alert_history', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      quality_alert_id: { type: DataTypes.INTEGER, allowNull: false },
      action: { type: DataTypes.STRING(32), allowNull: false },
      actor_email: { type: DataTypes.STRING(255), allowNull: true },
      from_status: { type: DataTypes.STRING(32), allowNull: true },
      to_status: { type: DataTypes.STRING(32), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('quality_alert_history', ['quality_alert_id'], { name: 'qah_alert_idx' });
  },

  async down(qi) {
    for (const t of [
      'quality_alert_history', 'operational_intelligence', 'qa_assignments',
      'quality_trends', 'replay_timeline_views', 'lineage_visualizations',
      'qa_workflows', 'quality_snapshots',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await qi.dropTable(t);
    }
  },
};
