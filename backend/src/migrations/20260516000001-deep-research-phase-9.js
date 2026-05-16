'use strict';

// Deep Research Intelligence Engine — Phase 9 schema (Submission Readiness +
// Compliance Intelligence). Eight new tables; nothing in Phases 1-8 is
// touched. All measure-only — no auto-submit / auto-bid / auto-sign state
// lives in these tables.
//
//   rfp_attachments              — RFP/amendment/supporting doc metadata.
//   proposal_artifacts           — reusable proposal library (resumes,
//                                  case studies, past performance, etc).
//   compliance_matrices          — top-level matrix per pursuit/opportunity.
//   compliance_matrix_items      — per-requirement rows inside a matrix.
//   submission_packages          — assembled package metadata snapshots.
//   proposal_timeline_events     — append-only event log per pursuit.
//   compliance_gaps              — detected gaps with severity + actions.
//   parallel_draft_jobs          — queued draft-generation work units.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- rfp_attachments ---------------------------------------------
    await queryInterface.createTable('rfp_attachments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      opportunity_id: { type: Sequelize.INTEGER, allowNull: true },
      // 'rfp' | 'amendment' | 'attachment' | 'compliance_doc' | 'supporting' |
      // 'qa_response' | 'past_proposal' | 'other'
      attachment_kind: { type: Sequelize.STRING(40), allowNull: false },
      label: { type: Sequelize.STRING(300), allowNull: false },
      filename: { type: Sequelize.STRING(500), allowNull: true },
      // Where the file lives — URL or content_ref string. NO file blob
      // storage in this phase (v1 metadata-only).
      content_ref: { type: Sequelize.STRING(1000), allowNull: true },
      mime_type: { type: Sequelize.STRING(120), allowNull: true },
      size_bytes: { type: Sequelize.INTEGER, allowNull: true },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      // Tags + relationship mapping.
      tags: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      related_attachment_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      uploaded_by: { type: Sequelize.STRING(120), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('rfp_attachments', ['pursuit_id'], { name: 'idx_rfp_pursuit' });
    await queryInterface.addIndex('rfp_attachments', ['opportunity_id'], { name: 'idx_rfp_opp' });
    await queryInterface.addIndex('rfp_attachments', ['attachment_kind'], { name: 'idx_rfp_kind' });

    // ---- proposal_artifacts ------------------------------------------
    await queryInterface.createTable('proposal_artifacts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'resume' | 'case_study' | 'past_performance' | 'certification' |
      // 'boilerplate' | 'diagram' | 'capability_statement' | 'reference' |
      // 'template'
      artifact_kind: { type: Sequelize.STRING(40), allowNull: false },
      label: { type: Sequelize.STRING(300), allowNull: false },
      content: { type: Sequelize.TEXT, allowNull: true },
      content_ref: { type: Sequelize.STRING(1000), allowNull: true },
      tags: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      capability_tags: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      agencies: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // 0-100 reuse-score — higher = surfaced first in suggestions.
      reuse_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 50 },
      times_used: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      // 'active' | 'expiring' | 'expired' | 'archived'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
      uploaded_by: { type: Sequelize.STRING(120), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('proposal_artifacts', ['artifact_kind'], { name: 'idx_artifact_kind' });
    await queryInterface.addIndex('proposal_artifacts', ['status'], { name: 'idx_artifact_status' });
    await queryInterface.addIndex('proposal_artifacts', ['expires_at'], { name: 'idx_artifact_expires' });

    // ---- compliance_matrices -----------------------------------------
    await queryInterface.createTable('compliance_matrices', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      opportunity_id: { type: Sequelize.INTEGER, allowNull: true },
      // Source of the parse — 'rfp_text', 'manual', 'template'.
      source: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'manual' },
      source_attachment_id: { type: Sequelize.INTEGER, allowNull: true },
      // Roll-up: total / satisfied / partial / missing.
      total_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      satisfied_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      partial_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      missing_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      completion_pct: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // Per-section due dates, page limits, format constraints.
      submission_constraints: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('compliance_matrices', ['pursuit_id'], { name: 'idx_cm_pursuit' });
    await queryInterface.addIndex('compliance_matrices', ['opportunity_id'], { name: 'idx_cm_opp' });

    // ---- compliance_matrix_items -------------------------------------
    await queryInterface.createTable('compliance_matrix_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      compliance_matrix_id: { type: Sequelize.INTEGER, allowNull: false },
      // 'requirement' | 'form' | 'certification' | 'attachment' | 'staffing' |
      // 'instruction' | 'due_date'
      item_kind: { type: Sequelize.STRING(30), allowNull: false },
      label: { type: Sequelize.STRING(500), allowNull: false },
      requirement_text: { type: Sequelize.TEXT, allowNull: true },
      // 'satisfied' | 'partial' | 'missing' | 'na'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'missing' },
      // Where this item maps in our system — artifact ids etc.
      satisfied_by: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      notes: { type: Sequelize.TEXT, allowNull: true },
      severity: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'normal' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('compliance_matrix_items', ['compliance_matrix_id'], { name: 'idx_cmi_matrix' });
    await queryInterface.addIndex('compliance_matrix_items', ['status'], { name: 'idx_cmi_status' });

    // ---- submission_packages -----------------------------------------
    await queryInterface.createTable('submission_packages', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(300), allowNull: false },
      // 'draft' | 'ready' | 'submitted' | 'archived'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'draft' },
      // Component references — opportunity outputs (drafts), rfp_attachments,
      // proposal_artifacts that make up the package.
      output_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      attachment_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      artifact_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Generated completeness score 0-100.
      completeness_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      missing_components: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      compliance_matrix_id: { type: Sequelize.INTEGER, allowNull: true },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      assembled_by: { type: Sequelize.STRING(120), allowNull: true },
      assembled_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      submitted_at: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    });
    await queryInterface.addIndex('submission_packages', ['pursuit_id'], { name: 'idx_sp_pursuit' });
    await queryInterface.addIndex('submission_packages', ['status'], { name: 'idx_sp_status' });

    // ---- proposal_timeline_events ------------------------------------
    await queryInterface.createTable('proposal_timeline_events', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: false },
      // 'milestone' | 'draft' | 'compliance' | 'artifact' | 'staffing' |
      // 'blocker' | 'submission' | 'note'
      event_kind: { type: Sequelize.STRING(30), allowNull: false },
      // 'pending' | 'in_progress' | 'done' | 'overdue' | 'blocked'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      label: { type: Sequelize.STRING(300), allowNull: false },
      detail: { type: Sequelize.TEXT, allowNull: true },
      due_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      severity: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'normal' },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('proposal_timeline_events', ['pursuit_id'], { name: 'idx_pte_pursuit' });
    await queryInterface.addIndex('proposal_timeline_events', ['status'], { name: 'idx_pte_status' });
    await queryInterface.addIndex('proposal_timeline_events', ['due_at'], { name: 'idx_pte_due' });

    // ---- compliance_gaps ---------------------------------------------
    await queryInterface.createTable('compliance_gaps', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: true },
      opportunity_id: { type: Sequelize.INTEGER, allowNull: true },
      // 'missing_certification' | 'missing_staffing' | 'missing_attachment' |
      // 'missing_form' | 'expired_artifact' | 'weak_capability'
      gap_kind: { type: Sequelize.STRING(40), allowNull: false },
      label: { type: Sequelize.STRING(300), allowNull: false },
      severity: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 50 },
      readiness_impact: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      recommended_actions: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      related_artifact_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // 'open' | 'acknowledged' | 'mitigated' | 'dismissed'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'open' },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      detected_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('compliance_gaps', ['pursuit_id'], { name: 'idx_cg_pursuit' });
    await queryInterface.addIndex('compliance_gaps', ['gap_kind', 'status'], { name: 'idx_cg_kind_status' });

    // ---- parallel_draft_jobs -----------------------------------------
    await queryInterface.createTable('parallel_draft_jobs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pursuit_id: { type: Sequelize.INTEGER, allowNull: false },
      opportunity_id: { type: Sequelize.INTEGER, allowNull: false },
      output_type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'proposal' },
      // 'queued' | 'running' | 'success' | 'failed' | 'skipped'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'queued' },
      output_id: { type: Sequelize.INTEGER, allowNull: true },
      attempt: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      // Concurrency tracking — when this job's slot was acquired.
      acquired_at: { type: Sequelize.DATE, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      batch_id: { type: Sequelize.STRING(60), allowNull: false },
      actor: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('parallel_draft_jobs', ['pursuit_id'], { name: 'idx_pdj_pursuit' });
    await queryInterface.addIndex('parallel_draft_jobs', ['batch_id'], { name: 'idx_pdj_batch' });
    await queryInterface.addIndex('parallel_draft_jobs', ['status'], { name: 'idx_pdj_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('parallel_draft_jobs');
    await queryInterface.dropTable('compliance_gaps');
    await queryInterface.dropTable('proposal_timeline_events');
    await queryInterface.dropTable('submission_packages');
    await queryInterface.dropTable('compliance_matrix_items');
    await queryInterface.dropTable('compliance_matrices');
    await queryInterface.dropTable('proposal_artifacts');
    await queryInterface.dropTable('rfp_attachments');
  },
};
