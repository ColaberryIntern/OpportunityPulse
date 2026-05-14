'use strict';

// Research Intelligence Phase 3a — embedding column.
//
// Stores a text embedding per opportunity as a JSONB array of floats.
// We deliberately do NOT use pgvector here: that would require swapping the
// prod Postgres image (alpine → debian) which forces a dump/restore cycle
// because of the musl→glibc collation difference. At the current corpus
// size (~250 research opps) in-process cosine similarity over JSONB is
// fine; pgvector becomes a planned migration when the corpus crosses ~5k
// rows. The column shape (a float array) is forward-compatible — a future
// pgvector migration just changes the column type + index, not the data.
//
// embedding_model + embedded_at let us re-embed when we change models.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('opportunities', 'embedding', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('opportunities', 'embedding_model', {
      type: Sequelize.STRING(60),
      allowNull: true,
    });
    await queryInterface.addColumn('opportunities', 'embedded_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // Partial index: lets "which rows still need embedding?" stay fast as
    // the table grows.
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_opportunities_needs_embedding
      ON opportunities (id)
      WHERE embedding IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_opportunities_needs_embedding;');
    await queryInterface.removeColumn('opportunities', 'embedded_at');
    await queryInterface.removeColumn('opportunities', 'embedding_model');
    await queryInterface.removeColumn('opportunities', 'embedding');
  },
};
