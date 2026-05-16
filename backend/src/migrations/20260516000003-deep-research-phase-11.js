'use strict';

// Deep Research Phase 11 — multi-tenant governance + operational auditability.
//
// 8 new tables. All append-only or rarely-mutated, all scoped by
// organization_id where multi-tenant isolation matters. No backfill — all
// existing rows live under the seeded default organization (id=1).

module.exports = {
  async up(qi, Sequelize) {
    const { DataTypes } = Sequelize;

    // 1) audit_events — append-only operator + system action log.
    await qi.createTable('audit_events', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true },
      actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
      actor_email: { type: DataTypes.STRING(255), allowNull: true },
      actor_role: { type: DataTypes.STRING(64), allowNull: true },
      action_kind: { type: DataTypes.STRING(64), allowNull: false },
      action_verb: { type: DataTypes.STRING(64), allowNull: false },
      subject_kind: { type: DataTypes.STRING(64), allowNull: true },
      subject_id: { type: DataTypes.STRING(128), allowNull: true },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      ip_address: { type: DataTypes.STRING(64), allowNull: true },
      user_agent: { type: DataTypes.STRING(512), allowNull: true },
      correlation_id: { type: DataTypes.STRING(64), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('audit_events', ['organization_id', 'created_at'], { name: 'audit_events_org_created_idx' });
    await qi.addIndex('audit_events', ['pursuit_id'], { name: 'audit_events_pursuit_idx' });
    await qi.addIndex('audit_events', ['action_kind', 'action_verb'], { name: 'audit_events_action_idx' });
    await qi.addIndex('audit_events', ['actor_user_id'], { name: 'audit_events_actor_idx' });

    // 2) event_lineage — directed edges between domain entities for traceability.
    await qi.createTable('event_lineage', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true },
      from_kind: { type: DataTypes.STRING(64), allowNull: false },
      from_id: { type: DataTypes.STRING(128), allowNull: false },
      to_kind: { type: DataTypes.STRING(64), allowNull: false },
      to_id: { type: DataTypes.STRING(128), allowNull: false },
      edge_kind: { type: DataTypes.STRING(64), allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('event_lineage', ['from_kind', 'from_id'], { name: 'event_lineage_from_idx' });
    await qi.addIndex('event_lineage', ['to_kind', 'to_id'], { name: 'event_lineage_to_idx' });
    await qi.addIndex('event_lineage', ['pursuit_id'], { name: 'event_lineage_pursuit_idx' });

    // 3) workflow_assignments — operator ownership + approval workflow chains.
    await qi.createTable('workflow_assignments', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true },
      workflow_kind: { type: DataTypes.STRING(64), allowNull: false },
      subject_kind: { type: DataTypes.STRING(64), allowNull: false },
      subject_id: { type: DataTypes.STRING(128), allowNull: false },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      assignee_user_id: { type: DataTypes.INTEGER, allowNull: true },
      assignee_email: { type: DataTypes.STRING(255), allowNull: true },
      assignee_role: { type: DataTypes.STRING(64), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
      due_at: { type: DataTypes.DATE, allowNull: true },
      assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      acknowledged_at: { type: DataTypes.DATE, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      assigned_by: { type: DataTypes.STRING(255), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('workflow_assignments', ['organization_id', 'status'], { name: 'workflow_assign_org_status_idx' });
    await qi.addIndex('workflow_assignments', ['assignee_user_id', 'status'], { name: 'workflow_assign_assignee_idx' });
    await qi.addIndex('workflow_assignments', ['subject_kind', 'subject_id'], { name: 'workflow_assign_subject_idx' });
    await qi.addIndex('workflow_assignments', ['pursuit_id'], { name: 'workflow_assign_pursuit_idx' });

    // 4) sla_acknowledgements — operator workflow log over Phase 10 sla_events.
    await qi.createTable('sla_acknowledgements', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      sla_event_id: { type: DataTypes.INTEGER, allowNull: false },
      organization_id: { type: DataTypes.INTEGER, allowNull: true },
      actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
      actor_email: { type: DataTypes.STRING(255), allowNull: true },
      action: { type: DataTypes.STRING(32), allowNull: false },
      severity_at_action: { type: DataTypes.INTEGER, allowNull: true },
      assignee_user_id: { type: DataTypes.INTEGER, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('sla_acknowledgements', ['sla_event_id'], { name: 'sla_ack_event_idx' });
    await qi.addIndex('sla_acknowledgements', ['organization_id', 'created_at'], { name: 'sla_ack_org_idx' });

    // 5) tenant_settings — per-organization governance overrides.
    await qi.createTable('tenant_settings', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      display_name: { type: DataTypes.STRING(255), allowNull: true },
      governance_mode: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'standard' },
      sla_thresholds: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      approval_required_for: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      storage_provider: { type: DataTypes.STRING(32), allowNull: true },
      feature_flags: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      retention_days: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // 6) operator_permissions — fine-grained per-user permission overlay.
    await qi.createTable('operator_permissions', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      role_name: { type: DataTypes.STRING(64), allowNull: false },
      permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      granted_by: { type: DataTypes.STRING(255), allowNull: true },
      granted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('operator_permissions', ['user_id', 'revoked_at'], { name: 'operator_perm_user_idx' });
    await qi.addIndex('operator_permissions', ['organization_id'], { name: 'operator_perm_org_idx' });

    // 7) governance_events — operator decisions over workflow + approvals.
    await qi.createTable('governance_events', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true },
      event_kind: { type: DataTypes.STRING(64), allowNull: false },
      severity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 40 },
      subject_kind: { type: DataTypes.STRING(64), allowNull: true },
      subject_id: { type: DataTypes.STRING(128), allowNull: true },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      actor_email: { type: DataTypes.STRING(255), allowNull: true },
      summary: { type: DataTypes.STRING(512), allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('governance_events', ['organization_id', 'created_at'], { name: 'governance_org_created_idx' });
    await qi.addIndex('governance_events', ['event_kind'], { name: 'governance_kind_idx' });

    // 8) observability_streams — registry of active SSE listeners (for fairness + audit).
    await qi.createTable('observability_streams', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true },
      stream_token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      user_id: { type: DataTypes.INTEGER, allowNull: true },
      user_email: { type: DataTypes.STRING(255), allowNull: true },
      channels: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      connected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      last_event_at: { type: DataTypes.DATE, allowNull: true },
      events_sent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      disconnected_at: { type: DataTypes.DATE, allowNull: true },
      ip_address: { type: DataTypes.STRING(64), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('observability_streams', ['organization_id'], { name: 'obs_stream_org_idx' });
    await qi.addIndex('observability_streams', ['disconnected_at'], { name: 'obs_stream_disc_idx' });
  },

  async down(qi) {
    for (const t of [
      'observability_streams', 'governance_events', 'operator_permissions',
      'tenant_settings', 'sla_acknowledgements', 'workflow_assignments',
      'event_lineage', 'audit_events',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await qi.dropTable(t);
    }
  },
};
