'use strict';

// Submission Readiness Engine v0.2 — per-opp AI-detected requirements.
// Cached on the BonfireOpportunity row so repeated readiness calls don't
// re-invoke Claude. Re-generation is admin-only via POST /tailor-requirements.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bonfire_opportunities', 'submission_requirements', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('bonfire_opportunities', 'submission_requirements');
  },
};
