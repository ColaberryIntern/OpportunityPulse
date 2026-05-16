'use strict';

// Deep Research Phase 13 — cross-phase provenance completion + governance consistency.
//
// Part A: Phase 12 follow-up — add organization_id to opportunity_outputs
//          (the legacy table provenance score reads from).
// Part B: 8 new tables for Phase 13.

const DEFAULT_ORG_ID = Number(process.env.DEEP_RESEARCH_DEFAULT_ORG_ID) || 1;

module.exports = {
  async up(qi, Sequelize) {
    const { DataTypes } = Sequelize;

    // ---- Part A: backfill opportunity_outputs ----------------------------
    const ooDesc = await qi.describeTable('opportunity_outputs');
    if (!ooDesc.organization_id) {
      await qi.addColumn('opportunity_outputs', 'organization_id', {
        type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID,
      });
      await qi.sequelize.query(
        `UPDATE "opportunity_outputs" SET organization_id = :orgId WHERE organization_id IS NULL`,
        { replacements: { orgId: DEFAULT_ORG_ID } },
      );
      await qi.addIndex('opportunity_outputs', ['organization_id'], { name: 'opp_outputs_org_id_idx' });
    }

    // ---- Part B: Phase 13 tables ----------------------------------------

    // 1) cross_provenance — unified provenance across every operational object.
    await qi.createTable('cross_provenance', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      subject_kind: { type: DataTypes.STRING(64), allowNull: false },
      subject_id: { type: DataTypes.STRING(128), allowNull: false },
      provenance_kind: { type: DataTypes.STRING(64), allowNull: false },
      source_kind: { type: DataTypes.STRING(64), allowNull: true },
      source_id: { type: DataTypes.STRING(128), allowNull: true },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      actor_email: { type: DataTypes.STRING(255), allowNull: true },
      summary: { type: DataTypes.STRING(512), allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('cross_provenance', ['subject_kind', 'subject_id'], { name: 'crossprov_subject_idx' });
    await qi.addIndex('cross_provenance', ['organization_id', 'created_at'], { name: 'crossprov_org_idx' });
    await qi.addIndex('cross_provenance', ['pursuit_id'], { name: 'crossprov_pursuit_idx' });

    // 2) operational_lineage — denormalized lineage graph node + edges.
    await qi.createTable('operational_lineage', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      from_kind: { type: DataTypes.STRING(64), allowNull: false },
      from_id: { type: DataTypes.STRING(128), allowNull: false },
      to_kind: { type: DataTypes.STRING(64), allowNull: false },
      to_id: { type: DataTypes.STRING(128), allowNull: false },
      relation: { type: DataTypes.STRING(64), allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      weight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('operational_lineage', ['from_kind', 'from_id'], { name: 'oplineage_from_idx' });
    await qi.addIndex('operational_lineage', ['to_kind', 'to_id'], { name: 'oplineage_to_idx' });
    await qi.addIndex('operational_lineage', ['pursuit_id'], { name: 'oplineage_pursuit_idx' });

    // 3) governance_drift — detected drift events with severity + remediation.
    await qi.createTable('governance_drift', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      drift_kind: { type: DataTypes.STRING(64), allowNull: false },
      severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
      impact: { type: DataTypes.STRING(255), allowNull: true },
      remediation: { type: DataTypes.TEXT, allowNull: true },
      subject_kind: { type: DataTypes.STRING(64), allowNull: true },
      subject_id: { type: DataTypes.STRING(128), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
      detected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('governance_drift', ['organization_id', 'status'], { name: 'gov_drift_org_status_idx' });
    await qi.addIndex('governance_drift', ['drift_kind'], { name: 'gov_drift_kind_idx' });

    // 4) approval_lineage — append-only approval chain history.
    await qi.createTable('approval_lineage', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      workflow_assignment_id: { type: DataTypes.INTEGER, allowNull: true },
      subject_kind: { type: DataTypes.STRING(64), allowNull: false },
      subject_id: { type: DataTypes.STRING(128), allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      action: { type: DataTypes.STRING(32), allowNull: false },
      actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
      actor_email: { type: DataTypes.STRING(255), allowNull: true },
      from_state: { type: DataTypes.STRING(32), allowNull: true },
      to_state: { type: DataTypes.STRING(32), allowNull: true },
      duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      override_reason: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('approval_lineage', ['workflow_assignment_id'], { name: 'approval_lineage_wa_idx' });
    await qi.addIndex('approval_lineage', ['organization_id', 'created_at'], { name: 'approval_lineage_org_idx' });
    await qi.addIndex('approval_lineage', ['pursuit_id'], { name: 'approval_lineage_pursuit_idx' });

    // 5) replay_events — read-only replay event log (synthesized from other tables).
    await qi.createTable('replay_events', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      replay_scope: { type: DataTypes.STRING(64), allowNull: false },
      scope_id: { type: DataTypes.STRING(128), allowNull: false },
      ordinal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      event_kind: { type: DataTypes.STRING(64), allowNull: false },
      event_at: { type: DataTypes.DATE, allowNull: false },
      actor_email: { type: DataTypes.STRING(255), allowNull: true },
      source_table: { type: DataTypes.STRING(64), allowNull: false },
      source_id: { type: DataTypes.STRING(128), allowNull: true },
      summary: { type: DataTypes.STRING(512), allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('replay_events', ['replay_scope', 'scope_id', 'ordinal'], { name: 'replay_events_scope_idx' });
    await qi.addIndex('replay_events', ['organization_id', 'created_at'], { name: 'replay_events_org_idx' });

    // 6) permission_integrity — point-in-time permission integrity audit.
    await qi.createTable('permission_integrity', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      snapshot_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      total_users: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      mapped_users: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      over_permissioned_users: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      orphan_grants: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      stale_grants: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      integrity_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('permission_integrity', ['organization_id', 'snapshot_at'], { name: 'perm_integ_org_idx' });

    // 7) stream_integrity — SSE reliability + drop / dup / reconnect metrics.
    await qi.createTable('stream_integrity', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      window_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      heartbeats_emitted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      events_published: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      events_dropped: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      duplicate_suppressed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      reconnect_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      max_concurrent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      backpressure_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      captured_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('stream_integrity', ['organization_id', 'captured_at'], { name: 'stream_integ_org_idx' });

    // 8) governance_consistency — detected inconsistencies + recommendations.
    await qi.createTable('governance_consistency', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      check_kind: { type: DataTypes.STRING(64), allowNull: false },
      severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
      subject_kind: { type: DataTypes.STRING(64), allowNull: true },
      subject_id: { type: DataTypes.STRING(128), allowNull: true },
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
    await qi.addIndex('governance_consistency', ['organization_id', 'status'], { name: 'gov_cons_org_idx' });
    await qi.addIndex('governance_consistency', ['check_kind'], { name: 'gov_cons_kind_idx' });
  },

  async down(qi) {
    for (const t of [
      'governance_consistency', 'stream_integrity', 'permission_integrity',
      'replay_events', 'approval_lineage', 'governance_drift',
      'operational_lineage', 'cross_provenance',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await qi.dropTable(t);
    }
    try {
      await qi.removeIndex('opportunity_outputs', 'opp_outputs_org_id_idx');
      await qi.removeColumn('opportunity_outputs', 'organization_id');
    } catch (e) { /* */ }
  },
};
