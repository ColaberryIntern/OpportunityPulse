'use strict';

// Deep Research Phase 10 — operational scalability + execution infrastructure.
// Eight new tables; nothing in Phases 1-9 is touched. Every table here is
// metadata-only (no file blobs, no executable code) and audit-friendly.
//
//   worker_jobs                 — durable background worker queue.
//   proposal_execution_queue    — high-level queue entries per pursuit batch.
//   artifact_lifecycle_events   — append-only artifact aging log.
//   sla_events                  — append-only SLA breach detection log.
//   queue_metrics               — periodic throughput / health snapshots.
//   storage_assets              — file storage registry (s3 / minio / local).
//   execution_failures          — typed failure log with retry tracking.
//   operational_metrics         — per-pursuit operational health snapshots.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- worker_jobs -------------------------------------------------
    await queryInterface.createTable('worker_jobs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'draft_generation' | 'compliance_parse' | 'package_assembly' |
      // 'artifact_lifecycle_scan' | 'sla_scan' | 'storage_upload'
      job_kind: { type: Sequelize.STRING(40), allowNull: false },
      // 'queued' | 'processing' | 'waiting' | 'blocked' | 'completed' |
      // 'failed' | 'cancelled'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'queued' },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 50 },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      opportunity_id: { type: Sequelize.INTEGER, allowNull: true },
      // Job payload (what to do) + result (what happened).
      payload: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      result: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      attempt: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      // Scheduling.
      run_after: { type: Sequelize.DATE, allowNull: true },
      acquired_at: { type: Sequelize.DATE, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      progress_pct: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      batch_id: { type: Sequelize.STRING(60), allowNull: true },
      actor: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('worker_jobs', ['status', 'priority'], { name: 'idx_wj_status_priority' });
    await queryInterface.addIndex('worker_jobs', ['pursuit_id'], { name: 'idx_wj_pursuit' });
    await queryInterface.addIndex('worker_jobs', ['batch_id'], { name: 'idx_wj_batch' });
    await queryInterface.addIndex('worker_jobs', ['job_kind', 'status'], { name: 'idx_wj_kind_status' });

    // ---- proposal_execution_queue ------------------------------------
    await queryInterface.createTable('proposal_execution_queue', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: false },
      // 'draft_batch' | 'compliance_build' | 'package_assemble' |
      // 'context_inject' | 'artifact_scan' | 'sla_scan'
      queue_kind: { type: Sequelize.STRING(40), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'queued' },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 50 },
      total_jobs: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      succeeded_jobs: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      failed_jobs: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      payload: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      result: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      sla_due_at: { type: Sequelize.DATE, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      actor: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('proposal_execution_queue', ['pursuit_id'], { name: 'idx_peq_pursuit' });
    await queryInterface.addIndex('proposal_execution_queue', ['status'], { name: 'idx_peq_status' });

    // ---- artifact_lifecycle_events -----------------------------------
    await queryInterface.createTable('artifact_lifecycle_events', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      proposal_artifact_id: { type: Sequelize.INTEGER, allowNull: false },
      // 'created' | 'used' | 'expiring' | 'expired' | 'renewed' | 'archived'
      event_kind: { type: Sequelize.STRING(30), allowNull: false },
      detail: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('artifact_lifecycle_events', ['proposal_artifact_id'], { name: 'idx_ale_artifact' });
    await queryInterface.addIndex('artifact_lifecycle_events', ['event_kind'], { name: 'idx_ale_kind' });

    // ---- sla_events --------------------------------------------------
    await queryInterface.createTable('sla_events', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'gap_aging' | 'pursuit_stagnant' | 'draft_stalled' | 'queue_aging' |
      // 'readiness_stagnant' | 'blocker_aging'
      sla_kind: { type: Sequelize.STRING(40), allowNull: false },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      subject_kind: { type: Sequelize.STRING(40), allowNull: true },
      subject_id: { type: Sequelize.STRING(120), allowNull: true },
      severity: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 50 },
      age_days: { type: Sequelize.INTEGER, allowNull: true },
      threshold_days: { type: Sequelize.INTEGER, allowNull: true },
      escalation: { type: Sequelize.TEXT, allowNull: true },
      // 'open' | 'acknowledged' | 'resolved' | 'dismissed'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'open' },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      detected_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('sla_events', ['sla_kind', 'status'], { name: 'idx_sla_kind_status' });
    await queryInterface.addIndex('sla_events', ['pursuit_id'], { name: 'idx_sla_pursuit' });

    // ---- queue_metrics -----------------------------------------------
    await queryInterface.createTable('queue_metrics', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // Per-kind throughput snapshot.
      queue_kind: { type: Sequelize.STRING(40), allowNull: false },
      window_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 60 },
      jobs_queued: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      jobs_processing: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      jobs_succeeded: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      jobs_failed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      jobs_cancelled: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      median_latency_ms: { type: Sequelize.INTEGER, allowNull: true },
      p95_latency_ms: { type: Sequelize.INTEGER, allowNull: true },
      retry_rate: { type: Sequelize.DECIMAL(5, 3), allowNull: false, defaultValue: 0 },
      captured_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('queue_metrics', ['queue_kind', 'captured_at'], { name: 'idx_qm_kind_captured' });

    // ---- storage_assets ----------------------------------------------
    await queryInterface.createTable('storage_assets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'rfp_attachment' | 'proposal_artifact' | 'submission_package' |
      // 'staffing_doc' | 'compliance_doc' | 'other'
      asset_kind: { type: Sequelize.STRING(40), allowNull: false },
      // 'local' | 's3' | 'minio' | 'url_only'
      provider: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'url_only' },
      bucket: { type: Sequelize.STRING(200), allowNull: true },
      key: { type: Sequelize.STRING(1000), allowNull: false },
      filename: { type: Sequelize.STRING(500), allowNull: true },
      mime_type: { type: Sequelize.STRING(120), allowNull: true },
      size_bytes: { type: Sequelize.INTEGER, allowNull: true },
      checksum: { type: Sequelize.STRING(120), allowNull: true },
      // RBAC + retention.
      visibility: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'admin' },
      retention_days: { type: Sequelize.INTEGER, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      // Backreference links.
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      rfp_attachment_id: { type: Sequelize.INTEGER, allowNull: true },
      proposal_artifact_id: { type: Sequelize.INTEGER, allowNull: true },
      submission_package_id: { type: Sequelize.INTEGER, allowNull: true },
      uploaded_by: { type: Sequelize.STRING(120), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('storage_assets', ['asset_kind'], { name: 'idx_sa_kind' });
    await queryInterface.addIndex('storage_assets', ['pursuit_id'], { name: 'idx_sa_pursuit' });

    // ---- execution_failures ------------------------------------------
    await queryInterface.createTable('execution_failures', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      worker_job_id: { type: Sequelize.INTEGER, allowNull: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      // 'transient' | 'permanent' | 'config' | 'upstream' | 'timeout'
      failure_kind: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'transient' },
      job_kind: { type: Sequelize.STRING(40), allowNull: false },
      error_message: { type: Sequelize.TEXT, allowNull: false },
      error_class: { type: Sequelize.STRING(120), allowNull: true },
      attempt: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      will_retry: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      next_retry_at: { type: Sequelize.DATE, allowNull: true },
      stack_snippet: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      detected_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('execution_failures', ['worker_job_id'], { name: 'idx_ef_job' });
    await queryInterface.addIndex('execution_failures', ['failure_kind'], { name: 'idx_ef_kind' });

    // ---- operational_metrics -----------------------------------------
    await queryInterface.createTable('operational_metrics', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      // Per-pursuit composite snapshot.
      throughput_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      sla_pressure: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      aging_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      worker_health: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 100 },
      artifact_health: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      open_sla_events: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      queue_pressure: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      captured_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('operational_metrics', ['pursuit_id', 'captured_at'], { name: 'idx_om_pursuit_captured' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('operational_metrics');
    await queryInterface.dropTable('execution_failures');
    await queryInterface.dropTable('storage_assets');
    await queryInterface.dropTable('queue_metrics');
    await queryInterface.dropTable('sla_events');
    await queryInterface.dropTable('artifact_lifecycle_events');
    await queryInterface.dropTable('proposal_execution_queue');
    await queryInterface.dropTable('worker_jobs');
  },
};
