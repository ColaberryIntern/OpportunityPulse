'use strict';

// Deep Research Phase 12 — cross-phase tenant backfill + LLM provenance hardening.
//
// Part A: adds organization_id (default = 1) to every Phase 10 table that
//          was created without it.
// Part B: creates 8 new tables for Phase 12.

const DEFAULT_ORG_ID = Number(process.env.DEEP_RESEARCH_DEFAULT_ORG_ID) || 1;

const PHASE_10_TABLES = [
  'worker_jobs',
  'proposal_execution_queue',
  'artifact_lifecycle_events',
  'sla_events',
  'queue_metrics',
  'storage_assets',
  'execution_failures',
  'operational_metrics',
];

module.exports = {
  async up(qi, Sequelize) {
    const { DataTypes } = Sequelize;

    // ---- Part A: tenant backfill on Phase 10 tables ----------------------
    for (const table of PHASE_10_TABLES) {
      // Add column (no-op if it already exists). describeTable is cheap
      // and lets us be fully idempotent across re-runs.
      // eslint-disable-next-line no-await-in-loop
      const desc = await qi.describeTable(table);
      if (!desc.organization_id) {
        // eslint-disable-next-line no-await-in-loop
        await qi.addColumn(table, 'organization_id', {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: DEFAULT_ORG_ID,
        });
        // Backfill existing rows.
        // eslint-disable-next-line no-await-in-loop
        await qi.sequelize.query(
          `UPDATE "${table}" SET organization_id = :orgId WHERE organization_id IS NULL`,
          { replacements: { orgId: DEFAULT_ORG_ID } },
        );
        // eslint-disable-next-line no-await-in-loop
        await qi.addIndex(table, ['organization_id'], { name: `${table}_org_id_idx` });
      }
    }

    // ---- Part B: new Phase 12 tables -------------------------------------

    // 1) prompt_provenance — every prompt assembly recorded with audit hash.
    await qi.createTable('prompt_provenance', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      audit_hash: { type: DataTypes.STRING(64), allowNull: false },
      prompt_version: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'v1' },
      pursuit_id: { type: DataTypes.INTEGER, allowNull: true },
      opportunity_id: { type: DataTypes.INTEGER, allowNull: true },
      output_id: { type: DataTypes.INTEGER, allowNull: true },
      output_type: { type: DataTypes.STRING(32), allowNull: true },
      included_sections: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      excluded_sections: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      char_length: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      context_inputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      block_preview: { type: DataTypes.TEXT, allowNull: true },
      generated_by: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('prompt_provenance', ['organization_id', 'created_at'], { name: 'prompt_prov_org_created_idx' });
    await qi.addIndex('prompt_provenance', ['pursuit_id'], { name: 'prompt_prov_pursuit_idx' });
    await qi.addIndex('prompt_provenance', ['output_id'], { name: 'prompt_prov_output_idx' });
    await qi.addIndex('prompt_provenance', ['audit_hash'], { name: 'prompt_prov_hash_idx' });

    // 2) asset_migrations — idempotent storage migration job log.
    await qi.createTable('asset_migrations', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      storage_asset_id: { type: DataTypes.INTEGER, allowNull: false },
      from_provider: { type: DataTypes.STRING(32), allowNull: false },
      to_provider: { type: DataTypes.STRING(32), allowNull: false },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
      source_ref: { type: DataTypes.STRING(1024), allowNull: true },
      target_bucket: { type: DataTypes.STRING(255), allowNull: true },
      target_key: { type: DataTypes.STRING(512), allowNull: true },
      bytes: { type: DataTypes.INTEGER, allowNull: true },
      source_hash: { type: DataTypes.STRING(128), allowNull: true },
      target_hash: { type: DataTypes.STRING(128), allowNull: true },
      attempt: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      started_at: { type: DataTypes.DATE, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('asset_migrations', ['organization_id'], { name: 'asset_mig_org_idx' });
    await qi.addIndex('asset_migrations', ['storage_asset_id'], { name: 'asset_mig_asset_idx' });
    await qi.addIndex('asset_migrations', ['status'], { name: 'asset_mig_status_idx' });

    // 3) rbac_coverage — periodic snapshot of route-level RBAC coverage.
    await qi.createTable('rbac_coverage', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      snapshot_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      total_routes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      legacy_admin_routes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      requires_permission_routes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      unprotected_routes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      coverage_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // 4) governance_integrity — Phase 12 dashboard composite snapshots.
    await qi.createTable('governance_integrity', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      integrity_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      tenant_isolation_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      rbac_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      provenance_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      observability_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      retention_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      computed_inputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('governance_integrity', ['organization_id', 'created_at'], { name: 'gov_integ_org_idx' });

    // 5) sla_email_events — log of every SLA digest email sent.
    await qi.createTable('sla_email_events', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      recipient_email: { type: DataTypes.STRING(255), allowNull: true },
      digest_kind: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'daily' },
      severity_filter: { type: DataTypes.STRING(32), allowNull: true },
      events_included: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'queued' },
      subject: { type: DataTypes.STRING(255), allowNull: true },
      body_preview: { type: DataTypes.TEXT, allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('sla_email_events', ['organization_id', 'created_at'], { name: 'sla_email_org_idx' });
    await qi.addIndex('sla_email_events', ['status'], { name: 'sla_email_status_idx' });

    // 6) audit_archives — long-term cold storage manifest for audit_events.
    await qi.createTable('audit_archives', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      window_start: { type: DataTypes.DATE, allowNull: false },
      window_end: { type: DataTypes.DATE, allowNull: false },
      record_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      bytes_archived: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      archive_location: { type: DataTypes.STRING(1024), allowNull: true },
      archive_hash: { type: DataTypes.STRING(128), allowNull: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      completed_at: { type: DataTypes.DATE, allowNull: true },
    });
    await qi.addIndex('audit_archives', ['organization_id'], { name: 'audit_arch_org_idx' });

    // 7) permission_cache — short-TTL effective permissions per user.
    await qi.createTable('permission_cache', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      role_name: { type: DataTypes.STRING(64), allowNull: false },
      role_level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      effective_permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      cached_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // 8) stream_metrics — periodic snapshot of SSE bus throughput.
    await qi.createTable('stream_metrics', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: DEFAULT_ORG_ID },
      channel: { type: DataTypes.STRING(64), allowNull: false },
      window_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      events_published: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      events_throttled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active_subscribers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      captured_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await qi.addIndex('stream_metrics', ['channel', 'captured_at'], { name: 'stream_metric_channel_idx' });

    // ---- Part C: extend OpportunityOutput with prompt provenance pointer
    const ooDesc = await qi.describeTable('opportunity_outputs');
    if (!ooDesc.prompt_provenance_id) {
      await qi.addColumn('opportunity_outputs', 'prompt_provenance_id', {
        type: DataTypes.BIGINT, allowNull: true,
      });
      await qi.addIndex('opportunity_outputs', ['prompt_provenance_id'], { name: 'opp_output_prompt_prov_idx' });
    }
    if (!ooDesc.prompt_audit_hash) {
      await qi.addColumn('opportunity_outputs', 'prompt_audit_hash', {
        type: DataTypes.STRING(64), allowNull: true,
      });
    }
  },

  async down(qi) {
    // Drop new tables.
    for (const t of [
      'stream_metrics', 'permission_cache', 'audit_archives',
      'sla_email_events', 'governance_integrity', 'rbac_coverage',
      'asset_migrations', 'prompt_provenance',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await qi.dropTable(t);
    }
    // Drop the OpportunityOutput add-ons.
    try { await qi.removeColumn('opportunity_outputs', 'prompt_audit_hash'); } catch (e) { /* */ }
    try { await qi.removeColumn('opportunity_outputs', 'prompt_provenance_id'); } catch (e) { /* */ }
    // Drop the Phase 10 org_id columns (only if we added them).
    for (const t of PHASE_10_TABLES) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await qi.removeIndex(t, `${t}_org_id_idx`);
        // eslint-disable-next-line no-await-in-loop
        await qi.removeColumn(t, 'organization_id');
      } catch (e) { /* */ }
    }
  },
};
