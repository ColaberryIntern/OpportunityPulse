'use strict';

// Research Intelligence Phase 2.3 — research_authors + research_topics.
//
// Two aggregation tables built FROM the research opportunities already in
// the unified table. They're not a new ingestion source — they're a
// rolled-up view: "who keeps publishing in our high-priority topics" and
// "which topics are accelerating."
//
// research_authors: one row per distinct author name, with their paper
//   count + summed citation traction. linkedin/github/h_index columns are
//   stubbed for the Phase 2 author-extraction follow-up.
// research_topics: one row per topic (arXiv category / tag), with a
//   momentum score (recent paper volume) + paper count.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('research_authors', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(300), allowNull: false },
      institution: { type: Sequelize.STRING(300), allowNull: true },
      linkedin_url: { type: Sequelize.STRING(500), allowNull: true },
      github_url: { type: Sequelize.STRING(500), allowNull: true },
      // Aggregates recomputed by the extraction service each run.
      paper_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      citation_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      h_index: { type: Sequelize.INTEGER, allowNull: true },
      // JSONB: { topics: [...], sources: [...], latest_paper_at: ISO }
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      last_seen_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    // Author identity is name-based for v1 (no disambiguation yet) — unique
    // so the extraction service can upsert.
    await queryInterface.addConstraint('research_authors', {
      fields: ['name'],
      type: 'unique',
      name: 'uq_research_authors_name',
    });
    await queryInterface.addIndex('research_authors', ['citation_count'], { name: 'idx_research_authors_citations' });
    await queryInterface.addIndex('research_authors', ['paper_count'], { name: 'idx_research_authors_papers' });

    await queryInterface.createTable('research_topics', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      topic_name: { type: Sequelize.STRING(200), allowNull: false },
      paper_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Recent (last 30d) paper volume vs. prior 30d — the momentum signal.
      recent_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      prior_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      momentum_score: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      growth_rate: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      // 0-100: how often this topic is a high-priority build keyword.
      commercial_score: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      last_computed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('research_topics', {
      fields: ['topic_name'],
      type: 'unique',
      name: 'uq_research_topics_name',
    });
    await queryInterface.addIndex('research_topics', ['momentum_score'], { name: 'idx_research_topics_momentum' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('research_topics');
    await queryInterface.dropTable('research_authors');
  },
};
