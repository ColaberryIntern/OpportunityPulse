'use strict';

module.exports = {
  async up(queryInterface) {
    // Partial index for freelance-type queries
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_opp_freelance
      ON opportunities (type)
      WHERE type = 'freelance'
    `);

    // Composite index for freelance scoring queries
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_opp_freelance_score
      ON opportunities (type, ai_score)
      WHERE type = 'freelance'
    `);

    // Composite index for freelance time-based queries
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_opp_freelance_created
      ON opportunities (type, created_at)
      WHERE type = 'freelance'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_opp_freelance');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_opp_freelance_score');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_opp_freelance_created');
  },
};
