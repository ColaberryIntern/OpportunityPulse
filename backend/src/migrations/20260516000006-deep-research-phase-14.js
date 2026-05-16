'use strict';

// Deep Research Phase 14 — operational lineage activation + AI quality intelligence.

const DEFAULT_ORG_ID = Number(process.env.DEEP_RESEARCH_DEFAULT_ORG_ID) || 1;

module.exports = {
  async up(qi, Sequelize) {
    const { DataTypes } = Sequelize;

    // 1) proposal_quality
    await qi.createTable('proposal_quality', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      opportunity_output_id: { type: DataTypes.INTEGER, allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      composite_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      strategic_alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      completeness_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      evaluator_alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      differentiation_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      clarity_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      readiness_consistency_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      groundedness_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      operational_coherence_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      classification: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unscored' },
      strengths: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      weaknesses: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      recommendations: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('proposal_quality', ['organization_id', 'composite_score'], { name: 'pq_org_score_idx' });
    await qi.addIndex('proposal_quality', ['opportunity_output_id'], { name: 'pq_output_idx' });
    await qi.addIndex('proposal_quality', ['pursuit_id'], { name: 'pq_pursuit_idx' });

    // 2) groundedness_analysis
    await qi.createTable('groundedness_analysis', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      opportunity_output_id: { type: DataTypes.INTEGER, allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      groundedness_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      claims_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      claims_supported: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      claims_weak: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      claims_unsupported: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      citation_coverage_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      unsupported_samples: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      evidence_sources: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      computed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('groundedness_analysis', ['opportunity_output_id'], { name: 'ga_output_idx' });
    await qi.addIndex('groundedness_analysis', ['organization_id', 'computed_at'], { name: 'ga_org_idx' });

    // 3) strategic_coherence
    await qi.createTable('strategic_coherence', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      opportunity_output_id: { type: DataTypes.INTEGER, allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      coherence_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      conflicts: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      consistencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      pursuit_alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      positioning_alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      readiness_alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('strategic_coherence', ['opportunity_output_id'], { name: 'sc_output_idx' });

    // 4) evaluator_alignment
    await qi.createTable('evaluator_alignment', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      opportunity_output_id: { type: DataTypes.INTEGER, allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      priorities_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      priorities_addressed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      missing_priorities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      addressed_priorities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      recurring_agency_signals: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      strategic_patterns_matched: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      computed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('evaluator_alignment', ['opportunity_output_id'], { name: 'ea_output_idx' });

    // 5) replay_visualizations
    await qi.createTable('replay_visualizations', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      replay_scope: { type: DataTypes.STRING(64), allowNull: false },
      scope_id: { type: DataTypes.STRING(128), allowNull: false },
      event_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      duration_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      timeline: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      actors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      generated_by: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('replay_visualizations', ['replay_scope', 'scope_id'], { name: 'rv_scope_idx' });

    // 6) quality_metrics — periodic snapshots
    await qi.createTable('quality_metrics', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      avg_quality_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_groundedness_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_coherence_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_alignment_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      outputs_scored: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      outputs_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      coverage_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      captured_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('quality_metrics', ['organization_id', 'captured_at'], { name: 'qm_org_idx' });

    // 7) quality_alerts
    await qi.createTable('quality_alerts', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      alert_kind: { type: DataTypes.STRING(64), allowNull: false },
      severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
      opportunity_output_id: { type: DataTypes.INTEGER, allowNull: true },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      summary: { type: DataTypes.STRING(512), allowNull: true },
      recommendation: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
      detected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('quality_alerts', ['organization_id', 'status'], { name: 'qa_org_idx' });
    await qi.addIndex('quality_alerts', ['alert_kind'], { name: 'qa_kind_idx' });
  },

  async down(qi) {
    for (const t of [
      'quality_alerts', 'quality_metrics', 'replay_visualizations',
      'evaluator_alignment', 'strategic_coherence',
      'groundedness_analysis', 'proposal_quality',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await qi.dropTable(t);
    }
  },
};
