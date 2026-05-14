'use strict';

// Research Intelligence Phase 3c — research_relationships graph edges.
//
// Phase 2.2 computed cross-channel matches and stashed them on
// aiAnalysis.cross_channel_matches (a JSONB blob per research opp). That's
// fine for display but not queryable as a graph. This table materializes
// those matches as first-class, indexed, bidirectional-friendly edges:
//   (research_opportunity_id) --relationship_type--> (related_opportunity_id)
//
// relationship_type: 'cross_channel' for now (keyword-overlap link). Later
// phases can add 'cites', 'same_author', 'same_topic' etc. without a
// migration — it's just a string.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('research_relationships', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      research_opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      related_opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      relationship_type: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'cross_channel' },
      // The channel of the related opp — denormalized so the graph can be
      // grouped by channel without a join.
      related_channel: { type: Sequelize.STRING(40), allowNull: true },
      // 0-100ish strength; for cross_channel this is the shared-term count.
      score: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      // JSONB: { shared_terms: [...] } etc.
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('research_relationships', ['research_opportunity_id'], {
      name: 'idx_research_rel_research_opp',
    });
    await queryInterface.addIndex('research_relationships', ['related_opportunity_id'], {
      name: 'idx_research_rel_related_opp',
    });
    await queryInterface.addIndex('research_relationships', ['relationship_type'], {
      name: 'idx_research_rel_type',
    });
    // One edge per (research, related, type) — the builder upserts.
    await queryInterface.addConstraint('research_relationships', {
      fields: ['research_opportunity_id', 'related_opportunity_id', 'relationship_type'],
      type: 'unique',
      name: 'uq_research_rel_edge',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('research_relationships');
  },
};
