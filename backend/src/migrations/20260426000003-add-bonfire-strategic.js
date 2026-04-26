'use strict';

// Strategic Curation Agent output. The 7am M/W/F scraper produces raw
// opportunities; this table holds the curated/synthesized strategic plays
// generated at 8am M/W/F by the strategist agent.
//
// Each row represents a productizable opportunity (single high-value bid OR
// a cluster of similar bids that justify building a reusable AI system).
// Rejected if any of money / ROI / ai_system can't be filled — the agent
// won't store half-formed strategies.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bonfire_strategic_opportunities', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      title: { type: Sequelize.STRING(500), allowNull: false },
      // 1-2 paragraph executive summary of the opportunity.
      summary: { type: Sequelize.TEXT, allowNull: false },
      // 'standalone' = built from a single high-value bid.
      // 'cluster'    = synthesized from N similar bids that justify a product.
      pattern_type: { type: Sequelize.STRING(20), allowNull: false },
      // The bonfire_opportunities IDs that inspired this strategic opp.
      // Stored as JSONB for flexibility; not a FK array (Postgres has no native).
      source_opportunity_ids: { type: Sequelize.JSONB, defaultValue: [] },
      // Top-level scoring (separate from per-opp scoring) — agent's overall pick rank.
      strategic_score: { type: Sequelize.INTEGER, allowNull: true },
      // The three pillars. JSON shape documented in the model.
      money: { type: Sequelize.JSONB, allowNull: false },
      roi: { type: Sequelize.JSONB, allowNull: false },
      ai_system: { type: Sequelize.JSONB, allowNull: false },
      business_viability: { type: Sequelize.JSONB, allowNull: false },
      // Run identifier — all opps from a single 8am M/W/F run share this.
      // Useful for "show me today's batch" queries and for re-running.
      run_id: { type: Sequelize.STRING(60), allowNull: false },
      generated_for_date: { type: Sequelize.DATEONLY, allowNull: false },
      ai_model: { type: Sequelize.STRING(60), allowNull: true },
      // Admin lifecycle flags (review/dismiss without deleting).
      status: { type: Sequelize.STRING(20), defaultValue: 'new' }, // new|reviewed|dismissed|pursuing
      assigned_to: { type: Sequelize.UUID, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex('bonfire_strategic_opportunities', ['run_id'], {
      name: 'idx_bonfire_strategic_run',
    });
    await queryInterface.addIndex('bonfire_strategic_opportunities', ['generated_for_date'], {
      name: 'idx_bonfire_strategic_date',
    });
    await queryInterface.addIndex('bonfire_strategic_opportunities', ['strategic_score'], {
      name: 'idx_bonfire_strategic_score',
    });
    await queryInterface.addIndex('bonfire_strategic_opportunities', ['status'], {
      name: 'idx_bonfire_strategic_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('bonfire_strategic_opportunities', 'idx_bonfire_strategic_run').catch(() => {});
    await queryInterface.removeIndex('bonfire_strategic_opportunities', 'idx_bonfire_strategic_date').catch(() => {});
    await queryInterface.removeIndex('bonfire_strategic_opportunities', 'idx_bonfire_strategic_score').catch(() => {});
    await queryInterface.removeIndex('bonfire_strategic_opportunities', 'idx_bonfire_strategic_status').catch(() => {});
    await queryInterface.dropTable('bonfire_strategic_opportunities');
  },
};
