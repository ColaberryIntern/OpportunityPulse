'use strict';

// Deep Research Intelligence Engine — Phase 7 schema (Traceability +
// Opportunity Action Intelligence). Eight new tables; nothing in Phases
// 1-6 is touched.
//
//   opportunity_traceability     — links an insight (kind+id) to underlying opps.
//   custom_research_runs         — user-defined strategic searches with rerun history.
//   pursuit_workspaces           — proposal-pursuit boards anchored to a venture/cluster.
//   opportunity_relationships    — recurring relationships (agency/tech/vendor/NAICS/keyword).
//   justification_records        — composed rationale snapshots with linked traceability.
//   opportunity_graph_edges      — edges between entities in the opportunity graph.
//   proposal_acceleration_assets — reusable proposal components surfaced from past wins.
//   cluster_drilldowns           — cached drilldown views (themes/agencies/tech/etc).

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- opportunity_traceability -------------------------------------
    await queryInterface.createTable('opportunity_traceability', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'venture' | 'cluster' | 'pattern' | 'recommendation' | 'intervention' |
      // 'ecosystem' | 'pursuit' | 'research_run'
      insight_kind: { type: Sequelize.STRING(40), allowNull: false },
      insight_id: { type: Sequelize.INTEGER, allowNull: false },
      opportunity_id: { type: Sequelize.INTEGER, allowNull: false },
      // Relevance 0-100. Why this opp contributed.
      relevance: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      // 'direct_link' | 'cluster_classification' | 'report_source' |
      // 'pattern_match' | 'graph_edge' | 'manual'
      contribution: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'direct_link' },
      reasoning: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('opportunity_traceability', ['insight_kind', 'insight_id'], { name: 'idx_traceability_insight' });
    await queryInterface.addIndex('opportunity_traceability', ['opportunity_id'], { name: 'idx_traceability_opportunity' });

    // ---- custom_research_runs -----------------------------------------
    await queryInterface.createTable('custom_research_runs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(200), allowNull: false },
      // Free-text query + structured filters.
      query: { type: Sequelize.STRING(500), allowNull: false },
      filters: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // Last run snapshot.
      last_run_at: { type: Sequelize.DATE, allowNull: true },
      last_match_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_results: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Per-channel breakdown for the most recent run.
      last_breakdown: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // Append-only run history (each entry: { run_at, match_count, breakdown }).
      history: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      pinned: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('custom_research_runs', ['pinned'], { name: 'idx_research_runs_pinned' });

    // ---- pursuit_workspaces -------------------------------------------
    await queryInterface.createTable('pursuit_workspaces', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(200), allowNull: false },
      // What this workspace is anchored to: 'venture' | 'cluster' | 'pattern' |
      // 'custom' | 'opportunity'.
      anchor_kind: { type: Sequelize.STRING(30), allowNull: false },
      anchor_id: { type: Sequelize.INTEGER, allowNull: true },
      summary: { type: Sequelize.TEXT, allowNull: true },
      positioning: { type: Sequelize.TEXT, allowNull: true },
      // 'open' | 'in_progress' | 'submitted' | 'won' | 'lost' | 'archived'
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'open' },
      linked_opportunity_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      linked_output_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      staffing_recommendation: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      readiness_summary: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      notes: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_by: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('pursuit_workspaces', ['anchor_kind', 'anchor_id'], { name: 'idx_pursuits_anchor' });
    await queryInterface.addIndex('pursuit_workspaces', ['status'], { name: 'idx_pursuits_status' });

    // ---- opportunity_relationships -----------------------------------
    await queryInterface.createTable('opportunity_relationships', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'agency' | 'technology' | 'vendor' | 'naics' | 'keyword' | 'ecosystem'
      relationship_type: { type: Sequelize.STRING(30), allowNull: false },
      // The value that recurs (e.g. agency name, NAICS code, tech keyword).
      value: { type: Sequelize.STRING(300), allowNull: false },
      // Count of opportunities sharing this value.
      occurrence_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // First/last seen.
      first_seen_at: { type: Sequelize.DATE, allowNull: true },
      last_seen_at: { type: Sequelize.DATE, allowNull: true },
      // Linked opportunity ids (capped — top N).
      opportunity_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('opportunity_relationships', ['relationship_type', 'occurrence_count'], { name: 'idx_relationships_type_count' });
    await queryInterface.addIndex('opportunity_relationships', ['relationship_type', 'value'], { name: 'idx_relationships_type_value' });

    // ---- justification_records ---------------------------------------
    await queryInterface.createTable('justification_records', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      insight_kind: { type: Sequelize.STRING(40), allowNull: false },
      insight_id: { type: Sequelize.INTEGER, allowNull: false },
      headline: { type: Sequelize.TEXT, allowNull: true },
      // Why this matters (composed text).
      narrative: { type: Sequelize.TEXT, allowNull: true },
      // Structured factors with weights + labels.
      factors: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Channels that contributed (with counts).
      channels: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // Top supporting opportunity ids (capped).
      supporting_opportunity_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      confidence: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('justification_records', ['insight_kind', 'insight_id'], { name: 'idx_justification_insight' });

    // ---- opportunity_graph_edges -------------------------------------
    await queryInterface.createTable('opportunity_graph_edges', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // Source entity.
      from_kind: { type: Sequelize.STRING(30), allowNull: false },
      from_value: { type: Sequelize.STRING(300), allowNull: false },
      // Target entity.
      to_kind: { type: Sequelize.STRING(30), allowNull: false },
      to_value: { type: Sequelize.STRING(300), allowNull: false },
      // 'classified_as' | 'mentions' | 'co_occurs' | 'shares_ecosystem' |
      // 'shares_technology' | 'shares_agency' | 'shares_naics'
      edge_type: { type: Sequelize.STRING(40), allowNull: false },
      weight: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 1 },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('opportunity_graph_edges', ['from_kind', 'from_value'], { name: 'idx_graph_from' });
    await queryInterface.addIndex('opportunity_graph_edges', ['to_kind', 'to_value'], { name: 'idx_graph_to' });
    await queryInterface.addIndex('opportunity_graph_edges', ['edge_type'], { name: 'idx_graph_edge_type' });

    // ---- proposal_acceleration_assets --------------------------------
    await queryInterface.createTable('proposal_acceleration_assets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 'past_win' | 'capability_blurb' | 'staffing_template' | 'pricing_template' |
      // 'naics_match' | 'agency_history'
      asset_kind: { type: Sequelize.STRING(40), allowNull: false },
      label: { type: Sequelize.STRING(200), allowNull: false },
      // The reusable content snippet.
      content: { type: Sequelize.TEXT, allowNull: true },
      // What this asset is best suited for.
      tags: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Where the content came from (e.g. OpportunityOutput id).
      source_kind: { type: Sequelize.STRING(40), allowNull: true },
      source_id: { type: Sequelize.INTEGER, allowNull: true },
      strength: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('proposal_acceleration_assets', ['asset_kind'], { name: 'idx_acceleration_assets_kind' });

    // ---- cluster_drilldowns ------------------------------------------
    // Cached drilldown view per cluster — refreshable. Holds the
    // pre-computed themes/agencies/tech/etc for fast UI loads.
    await queryInterface.createTable('cluster_drilldowns', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      cluster_id: { type: Sequelize.INTEGER, allowNull: false },
      opportunity_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Pre-aggregated arrays for the drilldown UI.
      themes: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      agencies: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      technologies: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      vendors: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      naics: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      strategic_language: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      sources: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // Sample opportunity ids (capped — full list comes from the join).
      sample_opportunity_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      computed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('cluster_drilldowns', ['cluster_id'], { name: 'idx_cluster_drilldowns_cluster' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cluster_drilldowns');
    await queryInterface.dropTable('proposal_acceleration_assets');
    await queryInterface.dropTable('opportunity_graph_edges');
    await queryInterface.dropTable('justification_records');
    await queryInterface.dropTable('opportunity_relationships');
    await queryInterface.dropTable('pursuit_workspaces');
    await queryInterface.dropTable('custom_research_runs');
    await queryInterface.dropTable('opportunity_traceability');
  },
};
